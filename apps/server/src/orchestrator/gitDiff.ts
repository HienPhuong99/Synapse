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
