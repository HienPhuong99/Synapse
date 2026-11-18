import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { WorktreeInfo } from '@synapse/shared';

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 30_000;
const NPM_INSTALL_TIMEOUT_MS = 180_000;
const CHAT_EXCLUDES = [':!chat.md', ':!**/chat.md', ':!*.chat.md', ':!**/*.chat.md', ':!*.archive.md', ':!**/*.archive.md'];

export class WorktreeError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly conflicts?: string[]
  ) {
    super(message);
    this.name = 'WorktreeError';
  }
}

interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

async function runGit(cwd: string, args: string[]): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: 1024 * 1024 * 4,
      windowsHide: true,
    });
    return { stdout, stderr, code: 0 };
  } catch (err) {
    const execErr = err as { stdout?: string; stderr?: string; code?: number | string; message?: string };
    return {
      stdout: execErr.stdout ?? '',
      stderr: execErr.stderr ?? execErr.message ?? 'git command failed',
      code: typeof execErr.code === 'number' ? execErr.code : 1,
    };
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function normalizePathKey(targetPath: string): string {
  const resolved = path.resolve(targetPath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isInsideNormalized(parent: string, candidate: string): boolean {
  const rel = path.relative(normalizePathKey(parent), normalizePathKey(candidate));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function sanitizeAgentId(agentId: string): string {
  const clean = agentId.trim().replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '');
  if (!clean || clean === '.' || clean === '..') {
    throw new WorktreeError(400, `Invalid agentId for worktree: "${agentId}"`);
  }
  return clean;
}

interface PorcelainWorktree {
  path: string;
  branch?: string;
  bare?: boolean;
}

function parseWorktreeList(stdout: string): PorcelainWorktree[] {
  const entries: PorcelainWorktree[] = [];
  let current: PorcelainWorktree | null = null;
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      if (current) {
        entries.push(current);
        current = null;
      }
      continue;
    }
    if (line.startsWith('worktree ')) {
      if (current) entries.push(current);
      current = { path: line.slice('worktree '.length).trim() };
    } else if (current && line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).trim();
    } else if (current && line === 'bare') {
      current.bare = true;
    }
  }
  if (current) entries.push(current);
  return entries;
}

export class WorktreeManager {
  private workspaceRoot: string;
  private registeredWorktrees = new Map<string, string>();
  private inFlightEnsures = new Map<string, Promise<string>>();

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  setWorkspaceRoot(workspaceRoot: string): void {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.registeredWorktrees.clear();
    this.inFlightEnsures.clear();
  }

  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  getBaseContainerDir(): string {
    const parent = path.dirname(this.workspaceRoot);
    const repoName = path.basename(this.workspaceRoot);
    return path.join(parent, `${repoName}.synapse-wt`);
  }

  getExpectedWorktreePath(agentId: string): string {
    return path.join(this.getBaseContainerDir(), sanitizeAgentId(agentId));
  }

  getBranchName(agentId: string): string {
    return `synapse/${sanitizeAgentId(agentId)}`;
  }

  getWorktreePath(agentId: string): string | undefined {
    return this.registeredWorktrees.get(sanitizeAgentId(agentId));
  }

  isRegisteredPath(candidatePath: string): boolean {
    if (!candidatePath) return false;
    for (const wtPath of this.registeredWorktrees.values()) {
      if (isInsideNormalized(wtPath, candidatePath)) return true;
    }
    return false;
  }

  async resolveWorktreePath(agentId: string): Promise<string | undefined> {
    const cleanId = sanitizeAgentId(agentId);
    const cached = this.registeredWorktrees.get(cleanId);
    if (cached && (await pathExists(cached))) {
      return cached;
    }
    const list = await this.listWorktrees();
    return list.find((item) => item.agentId === cleanId)?.path;
  }

  private async assertGitRepo(): Promise<void> {
    const check = await runGit(this.workspaceRoot, ['rev-parse', '--is-inside-work-tree']);
    if (check.code !== 0 || check.stdout.trim() !== 'true') {
      throw new WorktreeError(400, `Workspace is not a git repository: ${this.workspaceRoot}`);
    }
    const headCheck = await runGit(this.workspaceRoot, ['rev-parse', '--verify', 'HEAD']);
    if (headCheck.code !== 0) {
      throw new WorktreeError(400, 'Repository needs at least one commit before creating worktrees.');
    }
  }

  async ensureWorktree(agentId: string, opts?: { installDeps?: boolean }): Promise<string> {
    const cleanId = sanitizeAgentId(agentId);
    const pending = this.inFlightEnsures.get(cleanId);
    if (pending) return pending;

    const task = this.doEnsureWorktree(cleanId, opts).finally(() => {
      this.inFlightEnsures.delete(cleanId);
    });
    this.inFlightEnsures.set(cleanId, task);
    return task;
  }

  private async doEnsureWorktree(cleanId: string, opts?: { installDeps?: boolean }): Promise<string> {
    await this.assertGitRepo();
    const wtPath = this.getExpectedWorktreePath(cleanId);
    const branch = this.getBranchName(cleanId);
    const expectedKey = normalizePathKey(wtPath);

    await runGit(this.workspaceRoot, ['worktree', 'prune']);
    const listRes = await runGit(this.workspaceRoot, ['worktree', 'list', '--porcelain']);
    const existing =
      listRes.code === 0
        ? parseWorktreeList(listRes.stdout).find((entry) => normalizePathKey(entry.path) === expectedKey)
        : undefined;

    if (!existing || !(await pathExists(wtPath))) {
      await fs.mkdir(this.getBaseContainerDir(), { recursive: true });
      const branchRef = `refs/heads/${branch}`;
      const hasBranch = (await runGit(this.workspaceRoot, ['show-ref', '--verify', '--quiet', branchRef])).code === 0;
      const args = hasBranch
        ? ['worktree', 'add', wtPath, branch]
        : ['worktree', 'add', '-b', branch, wtPath, 'HEAD'];
      const addRes = await runGit(this.workspaceRoot, args);
      if (addRes.code !== 0) {
        throw new WorktreeError(500, `Failed to create worktree for @${cleanId}: ${addRes.stderr.trim()}`);
      }
    }

    this.registeredWorktrees.set(cleanId, wtPath);

    if (opts?.installDeps !== false) {
      const hasPackageJson = await pathExists(path.join(wtPath, 'package.json'));
      const hasNodeModules = await pathExists(path.join(wtPath, 'node_modules'));
      if (hasPackageJson && !hasNodeModules) {
        await this.installDependencies(wtPath);
      }
    }

    return wtPath;
  }

  private async installDependencies(wtPath: string): Promise<void> {
    try {
      await execFileAsync('npm', ['install', '--prefer-offline', '--no-audit', '--no-fund'], {
        cwd: wtPath,
        timeout: NPM_INSTALL_TIMEOUT_MS,
        maxBuffer: 1024 * 1024 * 8,
        shell: process.platform === 'win32',
        windowsHide: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new WorktreeError(500, `Worktree npm install failed in ${wtPath}: ${message}`);
    }
  }

  async commitTurnChanges(agentId: string, msgId: string): Promise<{ committed: boolean; sha?: string }> {
    const cleanId = sanitizeAgentId(agentId);
    const wtPath = await this.resolveWorktreePath(cleanId);
    if (!wtPath || !(await pathExists(wtPath))) {
      return { committed: false };
    }

    const addRes = await runGit(wtPath, ['add', '-A', '--', '.', ...CHAT_EXCLUDES]);
    if (addRes.code !== 0) {
      throw new WorktreeError(500, `Failed to stage worktree changes: ${addRes.stderr.trim()}`);
    }

    const diffCached = await runGit(wtPath, ['diff', '--cached', '--quiet']);
    if (diffCached.code === 0) {
      return { committed: false };
    }

    const commitMsg = `synapse(${cleanId}): ${msgId}`;
    let commitRes = await runGit(wtPath, ['commit', '-m', commitMsg]);
    if (commitRes.code !== 0 && /author identity unknown|unable to auto-detect email|user\.name|user\.email/i.test(commitRes.stderr)) {
      commitRes = await runGit(wtPath, [
        '-c',
        'user.name=Synapse Agent',
        '-c',
        'user.email=synapse@local',
        'commit',
        '-m',
        commitMsg,
      ]);
    }
    if (commitRes.code !== 0) {
      throw new WorktreeError(500, `Failed to commit worktree changes: ${commitRes.stderr.trim()}`);
    }

    const shaRes = await runGit(wtPath, ['rev-parse', '--short', 'HEAD']);
    return {
      committed: true,
      sha: shaRes.code === 0 ? shaRes.stdout.trim() : undefined,
    };
  }

  async listWorktrees(): Promise<WorktreeInfo[]> {
    const listRes = await runGit(this.workspaceRoot, ['worktree', 'list', '--porcelain']);
    if (listRes.code !== 0) return [];

    const mainKey = normalizePathKey(this.workspaceRoot);
    const baseDir = this.getBaseContainerDir();
    const entries = parseWorktreeList(listRes.stdout);
    const results: WorktreeInfo[] = [];

    for (const entry of entries) {
      if (entry.bare || normalizePathKey(entry.path) === mainKey) continue;
      const inSynapseDir = isInsideNormalized(baseDir, entry.path);
      const branchShort = entry.branch?.replace(/^refs\/heads\//, '') ?? '';
      const isSynapseBranch = branchShort.startsWith('synapse/');
      if (!inSynapseDir && !isSynapseBranch) continue;

      const rawId = isSynapseBranch
        ? branchShort.slice('synapse/'.length)
        : path.basename(entry.path);
      let agentId: string;
      try {
        agentId = sanitizeAgentId(rawId);
      } catch {
        continue;
      }

      this.registeredWorktrees.set(agentId, path.resolve(entry.path));

      const exists = await pathExists(entry.path);
      let dirty = false;
      let workingStat = '';
      if (exists) {
        const statusRes = await runGit(entry.path, ['status', '--porcelain']);
        dirty = statusRes.code === 0 && statusRes.stdout.trim().length > 0;
        if (dirty) {
          const wtDiff = await runGit(entry.path, ['diff', '--shortstat', 'HEAD']);
          workingStat = wtDiff.code === 0 ? wtDiff.stdout.trim() : '';
        }
      }

      let aheadCount = 0;
      let committedStat = '';
      if (branchShort) {
        const aheadRes = await runGit(this.workspaceRoot, ['rev-list', '--count', `HEAD..${branchShort}`]);
        aheadCount = aheadRes.code === 0 ? Number.parseInt(aheadRes.stdout.trim(), 10) || 0 : 0;
        if (aheadCount > 0) {
          const statRes = await runGit(this.workspaceRoot, ['diff', '--shortstat', `HEAD...${branchShort}`]);
          committedStat = statRes.code === 0 ? statRes.stdout.trim() : '';
        }
      }

      const diffStat = [committedStat, workingStat ? `uncommitted: ${workingStat}` : '']
        .filter(Boolean)
        .join(' · ');

      results.push({
        agentId,
        path: path.resolve(entry.path),
        branch: branchShort || this.getBranchName(agentId),
        diffStat,
        aheadCount,
        dirty,
      });
    }

    return results;
  }

  async mergeWorktree(agentId: string): Promise<{ merged: boolean; commit?: string; summary: string }> {
    await this.assertGitRepo();
    const cleanId = sanitizeAgentId(agentId);
    const branch = this.getBranchName(cleanId);

    // Synapse rewrites chat boards after every turn, so they are almost always dirty.
    // Worktree commits never include them, so they cannot clash with the merge.
    const statusRes = await runGit(this.workspaceRoot, ['status', '--porcelain', '--', '.', ...CHAT_EXCLUDES]);
    if (statusRes.code !== 0) {
      throw new WorktreeError(500, `Cannot check repository status: ${statusRes.stderr.trim()}`);
    }
    if (statusRes.stdout.trim().length > 0) {
      throw new WorktreeError(
        409,
        'Repo chính đang có thay đổi chưa commit. Hãy commit hoặc bỏ thay đổi trước khi merge worktree.'
      );
    }

    const branchCheck = await runGit(this.workspaceRoot, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]);
    if (branchCheck.code !== 0) {
      throw new WorktreeError(404, `Không tìm thấy branch ${branch} cho agent @${cleanId}.`);
    }

    const aheadRes = await runGit(this.workspaceRoot, ['rev-list', '--count', `HEAD..${branch}`]);
    const aheadCount = aheadRes.code === 0 ? Number.parseInt(aheadRes.stdout.trim(), 10) || 0 : 0;
    if (aheadCount === 0) {
      return { merged: false, summary: `Branch ${branch} không có commit mới để merge.` };
    }

    const mergeRes = await runGit(this.workspaceRoot, ['merge', '--no-ff', branch, '-m', `merge: ${branch}`]);
    if (mergeRes.code !== 0) {
      const conflictRes = await runGit(this.workspaceRoot, ['diff', '--name-only', '--diff-filter=U']);
      const conflicts = conflictRes.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      await runGit(this.workspaceRoot, ['merge', '--abort']);

      const detail = conflicts.length > 0 ? `: ${conflicts.join(', ')}` : '';
      throw new WorktreeError(
        409,
        `Merge ${branch} bị xung đột và đã được hủy tự động${detail}`,
        conflicts
      );
    }

    const shaRes = await runGit(this.workspaceRoot, ['rev-parse', '--short', 'HEAD']);
    const commit = shaRes.code === 0 ? shaRes.stdout.trim() : undefined;
    return {
      merged: true,
      commit,
      summary: `Đã merge ${branch} (${aheadCount} commit)${commit ? ` → ${commit}` : ''}.`,
    };
  }

  async removeWorktree(agentId: string): Promise<void> {
    const cleanId = sanitizeAgentId(agentId);
    const branch = this.getBranchName(cleanId);
    const wtPath = (await this.resolveWorktreePath(cleanId)) ?? this.getExpectedWorktreePath(cleanId);
    this.registeredWorktrees.delete(cleanId);

    const removeRes = await runGit(this.workspaceRoot, ['worktree', 'remove', '--force', wtPath]);
    if (removeRes.code !== 0 && isInsideNormalized(this.getBaseContainerDir(), wtPath) && (await pathExists(wtPath))) {
      await fs.rm(wtPath, { recursive: true, force: true });
    }
    await runGit(this.workspaceRoot, ['worktree', 'prune']);

    const branchCheck = await runGit(this.workspaceRoot, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]);
    if (branchCheck.code === 0) {
      await runGit(this.workspaceRoot, ['branch', '-D', branch]);
    }
  }
}
