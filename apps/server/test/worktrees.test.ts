import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import type { ChatDocument } from '@synapse/shared';
import { createSynapseServer } from '../src/app.js';
import { readWorktreeGitDiff } from '../src/orchestrator/gitDiff.js';
import { WorktreeError, WorktreeManager } from '../src/orchestrator/worktrees.js';
import { buildCliPrompt } from '../src/providers/cli.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, windowsHide: true });
  return stdout.trim();
}

async function initTempRepo(): Promise<{ parentDir: string; repoDir: string }> {
  const parentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'synapse-wt-test-'));
  const repoDir = path.join(parentDir, 'my-repo');
  await fs.mkdir(repoDir, { recursive: true });
  await git(repoDir, 'init');
  await git(repoDir, 'config', 'user.name', 'Test User');
  await git(repoDir, 'config', 'user.email', 'test@example.com');
  await fs.writeFile(path.join(repoDir, 'README.md'), '# Repo\n', 'utf8');
  await fs.mkdir(path.join(repoDir, 'src'), { recursive: true });
  await fs.writeFile(path.join(repoDir, 'src', 'shared.ts'), 'export const v = 1;\n', 'utf8');
  await git(repoDir, 'add', '.');
  await git(repoDir, 'commit', '-m', 'init');
  return { parentDir, repoDir };
}

test('WorktreeManager isolates directory outside repo, excludes chat files on auto-commit, merges safely, and aborts conflicts', async () => {
  const { parentDir, repoDir } = await initTempRepo();
  try {
    const manager = new WorktreeManager(repoDir);
    const wtPath = await manager.ensureWorktree('claude', { installDeps: false });

    const expectedContainer = path.join(parentDir, 'my-repo.synapse-wt');
    assert.equal(wtPath, path.join(expectedContainer, 'claude'));
    assert.equal(manager.isRegisteredPath(wtPath), true);
    assert.equal(manager.isRegisteredPath(path.join(wtPath, 'src', 'feature.ts')), true);
    assert.equal(manager.isRegisteredPath(path.join(parentDir, 'unrelated')), false);

    // Agent edits code plus stray chat.md / *.chat.md files in worktree
    await fs.writeFile(path.join(wtPath, 'src', 'feature.ts'), 'export const feature = true;\n', 'utf8');
    await fs.writeFile(path.join(wtPath, 'chat.md'), '# stray chat\n', 'utf8');
    await fs.mkdir(path.join(wtPath, 'examples'), { recursive: true });
    await fs.writeFile(path.join(wtPath, 'examples', 'topic.chat.md'), '# stray topic\n', 'utf8');

    const committed = await manager.commitTurnChanges('claude', 'm2');
    assert.equal(committed.committed, true);
    assert.ok(committed.sha);

    const changedFiles = await git(wtPath, 'show', '--name-only', '--pretty=format:', 'HEAD');
    assert.match(changedFiles, /src\/feature\.ts/);
    assert.doesNotMatch(changedFiles, /chat\.md/);

    // Diff vs main repo shows committed feature.ts
    const wtDiff = await readWorktreeGitDiff(repoDir, wtPath, 'synapse/claude');
    assert.equal(wtDiff.isGitRepo, true);
    assert.match(wtDiff.diff, /feature = true/);

    // List worktrees reports aheadCount = 1
    const listed = await manager.listWorktrees();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].agentId, 'claude');
    assert.equal(listed[0].aheadCount, 1);

    // Dirty main repo blocks merge with 409 without stashing
    await fs.writeFile(path.join(repoDir, 'README.md'), '# Dirty\n', 'utf8');
    await assert.rejects(
      () => manager.mergeWorktree('claude'),
      (err: unknown) => err instanceof WorktreeError && err.statusCode === 409
    );
    assert.equal(await fs.readFile(path.join(repoDir, 'README.md'), 'utf8'), '# Dirty\n');

    // Revert README so main repo is clean, then merge succeeds
    await git(repoDir, 'checkout', '--', 'README.md');
    const mergeRes = await manager.mergeWorktree('claude');
    assert.equal(mergeRes.merged, true);
    const mergedFeature = await fs.readFile(path.join(repoDir, 'src', 'feature.ts'), 'utf8');
    assert.equal(mergedFeature.replace(/\r\n/g, '\n'), 'export const feature = true;\n');

    // Remove claude worktree cleans directory and branch
    await manager.removeWorktree('claude');
    const afterRemove = await manager.listWorktrees();
    assert.equal(afterRemove.length, 0);

    // Conflict scenario on second worktree
    const geminiWt = await manager.ensureWorktree('gemini', { installDeps: false });
    await fs.writeFile(path.join(geminiWt, 'src', 'shared.ts'), 'export const v = 2; // gemini\n', 'utf8');
    await manager.commitTurnChanges('gemini', 'm3');

    await fs.writeFile(path.join(repoDir, 'src', 'shared.ts'), 'export const v = 99; // main\n', 'utf8');
    await git(repoDir, 'add', 'src/shared.ts');
    await git(repoDir, 'commit', '-m', 'main change');

    await assert.rejects(
      () => manager.mergeWorktree('gemini'),
      (err: unknown) =>
        err instanceof WorktreeError &&
        err.statusCode === 409 &&
        Array.isArray(err.conflicts) &&
        err.conflicts.includes('src/shared.ts')
    );
    // Merge was aborted cleanly so working tree is not left in conflict state
    assert.equal(await git(repoDir, 'status', '--porcelain'), '');
  } finally {
    await fs.rm(parentDir, { recursive: true, force: true });
  }
});

test('Server presence accepts registered worktrees and worktree HTTP API works end-to-end', async () => {
  const { parentDir, repoDir } = await initTempRepo();
  const server = await createSynapseServer({ workspaceRoot: repoDir });
  try {
    const wtPath = await server.worktrees.ensureWorktree('claude', { installDeps: false });
    await fs.writeFile(path.join(wtPath, 'src', 'added.ts'), 'export const added = 1;\n', 'utf8');
    await server.worktrees.commitTurnChanges('claude', 'm5');

    // Presence inside registered worktree is accepted
    const wtPresence = await server.app.inject({
      method: 'POST',
      url: '/api/presence',
      headers: { host: '127.0.0.1:4321' },
      payload: {
        agent: 'claude',
        event: 'PreToolUse',
        tool: 'Edit',
        workspaceRoot: wtPath,
      },
    });
    assert.equal(wtPresence.statusCode, 200);
    assert.equal(wtPresence.json().ignored, undefined);

    // Presence from unrelated path outside workspace is still ignored
    const otherPresence = await server.app.inject({
      method: 'POST',
      url: '/api/presence',
      headers: { host: '127.0.0.1:4321' },
      payload: {
        agent: 'claude',
        event: 'PreToolUse',
        workspaceRoot: path.join(parentDir, 'somewhere-else'),
      },
    });
    assert.equal(otherPresence.statusCode, 200);
    assert.equal(otherPresence.json().ignored, 'other workspace');

    // GET /api/worktrees & GET /api/git/diff?agentId=claude
    const listRes = await server.app.inject({
      method: 'GET',
      url: '/api/worktrees',
      headers: { host: '127.0.0.1:4321' },
    });
    assert.equal(listRes.statusCode, 200);
    assert.equal(listRes.json().worktrees.length, 1);

    const diffRes = await server.app.inject({
      method: 'GET',
      url: '/api/git/diff?agentId=claude',
      headers: { host: '127.0.0.1:4321' },
    });
    assert.equal(diffRes.statusCode, 200);
    assert.match(diffRes.json().diff, /added = 1/);

    // Merge & remove via HTTP
    const mergeRes = await server.app.inject({
      method: 'POST',
      url: '/api/worktrees/merge',
      headers: { host: '127.0.0.1:4321' },
      payload: { agentId: 'claude' },
    });
    assert.equal(mergeRes.statusCode, 200);
    assert.equal(mergeRes.json().merged, true);

    const removeRes = await server.app.inject({
      method: 'POST',
      url: '/api/worktrees/remove',
      headers: { host: '127.0.0.1:4321' },
      payload: { agentId: 'claude' },
    });
    assert.equal(removeRes.statusCode, 200);
  } finally {
    await server.app.close();
    await fs.rm(parentDir, { recursive: true, force: true });
  }
});

test('buildCliPrompt instructs CLI agent about isolated worktree when worktree is enabled', () => {
  const doc: ChatDocument = {
    filePath: 'chat.md',
    raw: '',
    meta: {
      title: 'Test',
      mode: 'mention',
      agents: [],
    },
    messages: [],
    preamble: '',
  };
  const prompt = buildCliPrompt(
    {
      agent: {
        id: 'claude',
        name: 'Claude',
        provider: 'claude-code',
        model: 'sonnet',
        color: '#888',
        worktree: true,
      },
      document: doc,
      fileExcerpts: [],
      settings: {},
      signal: new AbortController().signal,
      cwd: 'D:/Code/Synapse.synapse-wt/claude',
    },
    false
  );
  assert.match(prompt, /Git worktree riêng/);
  assert.match(prompt, /post_message/);
});
