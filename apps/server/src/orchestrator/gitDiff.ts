import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GitDiffPayload } from '@synapse/shared';

const execFileAsync = promisify(execFile);

async function runGit(cwd: string, args: string[]): Promise<{ ok: boolean; stdout: string }> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      timeout: 5000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
    return { ok: true, stdout };
  } catch {
    return { ok: false, stdout: '' };
  }
}

export async function readWorkspaceGitDiff(workspaceRoot: string, maxChars = 32_000): Promise<GitDiffPayload> {
  const inside = await runGit(workspaceRoot, ['rev-parse', '--is-inside-work-tree']);
  if (!inside.ok || inside.stdout.trim() !== 'true') {
    return {
      isGitRepo: false,
      statusShort: '',
      diffStat: '',
      diff: '',
      truncated: false,
    };
  }

  const [branchRes, statusRes, headCheck] = await Promise.all([
    runGit(workspaceRoot, ['rev-parse', '--abbrev-ref', 'HEAD']),
    runGit(workspaceRoot, ['status', '--short']),
    runGit(workspaceRoot, ['rev-parse', '--verify', 'HEAD']),
  ]);

  const diffArgs = headCheck.ok ? ['diff', 'HEAD'] : ['diff'];
  const [statRes, diffRes] = await Promise.all([
    runGit(workspaceRoot, [...diffArgs, '--stat']),
    runGit(workspaceRoot, diffArgs),
  ]);

  const rawDiff = diffRes.stdout;
  const truncated = rawDiff.length > maxChars;
  const diff = truncated ? `${rawDiff.slice(0, maxChars)}\n... [diff truncated at ${maxChars} chars]` : rawDiff;

  return {
    isGitRepo: true,
    branch: branchRes.ok ? branchRes.stdout.trim() : undefined,
    statusShort: statusRes.stdout.trimEnd(),
    diffStat: statRes.stdout.trimEnd(),
    diff,
    truncated,
  };
}

export async function readWorktreeGitDiff(
  mainWorkspaceRoot: string,
  wtPath: string,
  fallbackBranch?: string,
  maxChars = 32_000
): Promise<GitDiffPayload> {
  const inside = await runGit(wtPath, ['rev-parse', '--is-inside-work-tree']);
  if (!inside.ok || inside.stdout.trim() !== 'true') {
    return {
      isGitRepo: false,
      statusShort: '',
      diffStat: '',
      diff: '',
      truncated: false,
    };
  }

  const [mainHeadRes, branchRes, statusRes] = await Promise.all([
    runGit(mainWorkspaceRoot, ['rev-parse', '--verify', 'HEAD']),
    runGit(wtPath, ['rev-parse', '--abbrev-ref', 'HEAD']),
    runGit(wtPath, ['status', '--short']),
  ]);

  let diffBase = 'HEAD';
  if (mainHeadRes.ok && mainHeadRes.stdout.trim()) {
    const mainHead = mainHeadRes.stdout.trim();
    const baseRes = await runGit(wtPath, ['merge-base', mainHead, 'HEAD']);
    diffBase = baseRes.ok && baseRes.stdout.trim() ? baseRes.stdout.trim() : mainHead;
  }

  const [statRes, diffRes] = await Promise.all([
    runGit(wtPath, ['diff', diffBase, '--stat']),
    runGit(wtPath, ['diff', diffBase]),
  ]);

  const rawDiff = diffRes.stdout;
  const truncated = rawDiff.length > maxChars;
  const diff = truncated ? `${rawDiff.slice(0, maxChars)}\n... [diff truncated at ${maxChars} chars]` : rawDiff;

  return {
    isGitRepo: true,
    branch: (branchRes.ok ? branchRes.stdout.trim() : '') || fallbackBranch,
    statusShort: statusRes.stdout.trimEnd(),
    diffStat: statRes.stdout.trimEnd(),
    diff,
    truncated,
  };
}
