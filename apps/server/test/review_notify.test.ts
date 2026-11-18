import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { createSynapseServer } from '../src/app.js';
import http from 'node:http';
import { isValidHttpUrl, sendNtfyNotification } from '../src/presence/notify.js';

const execFileAsync = promisify(execFile);

describe('Notifications (#6) & Review Gate (#3)', () => {
  let tmpDir: string;
  let baseUrl: string;
  let closeServer: () => Promise<void>;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'synapse-review-'));
    await execFileAsync('git', ['init', '-b', 'main'], { cwd: tmpDir });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmpDir });
    await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: tmpDir });

    await fs.writeFile(path.join(tmpDir, 'hello.ts'), 'export const a = 1;\n', 'utf8');
    await fs.writeFile(
      path.join(tmpDir, 'demo.chat.md'),
      `---
schema: synapse/v1
title: "Review Gate Test"
mode: mention
max_turns: 4
status: idle
agents:
  - id: reviewer
    name: "Reviewer"
    role: "Code Reviewer"
    provider: simulator
    model: synapse-sim-1
    color: "#f59e0b"
---

## [msg_01] @human · 2026-11-18T12:00:00+07:00
READY FOR REVIEW
`,
      'utf8'
    );

    await execFileAsync('git', ['add', '.'], { cwd: tmpDir });
    await execFileAsync('git', ['commit', '-m', 'init'], { cwd: tmpDir });

    // Create an unstaged modification to review
    await fs.writeFile(path.join(tmpDir, 'hello.ts'), 'export const a = 2;\n', 'utf8');

    const { app } = await createSynapseServer({ workspaceRoot: tmpDir });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    if (!addr || typeof addr === 'string') throw new Error('Invalid address');
    baseUrl = `http://127.0.0.1:${addr.port}`;
    closeServer = () => app.close();
  });

  after(async () => {
    await closeServer();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('validates ntfy topic URLs safely', () => {
    assert.equal(isValidHttpUrl('https://ntfy.sh/my-topic'), true);
    assert.equal(isValidHttpUrl('http://127.0.0.1:8080/topic'), true);
    assert.equal(isValidHttpUrl('javascript:alert(1)'), false);
    assert.equal(isValidHttpUrl('file:///etc/passwd'), false);
    assert.equal(isValidHttpUrl(''), false);
  });

  it('delivers ntfy pushes with Vietnamese titles', async () => {
    let got: { url?: string; body: string } = { body: '' };
    const srv = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        got = { url: req.url, body };
        res.end('{}');
      });
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    const { port } = srv.address() as { port: number };
    try {
      const ok = await sendNtfyNotification(`http://127.0.0.1:${port}/topic`, { title: 'Lỗi ở @claude', body: 'Hỏng rồi', level: 'error' });
      assert.equal(ok, true);
      const q = new URL(got.url!, 'http://x').searchParams;
      assert.equal(q.get('title'), 'Lỗi ở @claude');
      assert.equal(q.get('priority'), 'high');
      assert.equal(got.body, 'Hỏng rồi');
    } finally {
      srv.close();
    }
  });

  it('returns git diff and sends it to the reviewer agent', async () => {
    const diffRes = await fetch(`${baseUrl}/api/git/diff`);
    assert.equal(diffRes.status, 200);
    const diffData = (await diffRes.json()) as { isGitRepo: boolean; diff: string; statusShort: string };
    assert.equal(diffData.isGitRepo, true);
    assert.match(diffData.diff, /export const a = 2;/);

    const reviewRes = await fetch(`${baseUrl}/api/sessions/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'demo.chat.md', reviewerId: 'reviewer' }),
    });
    assert.equal(reviewRes.status, 200);

    let count = 1;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 150));
      const docRes = await fetch(`${baseUrl}/api/sessions/doc?path=demo.chat.md`);
      const docData = (await docRes.json()) as { document: { messages: { author: string }[] } };
      count = docData.document.messages.length;
      if (count >= 2) break;
    }
    assert.equal(count, 2);
  });

  it('clears previous presences when switching workspace', async () => {
    await fetch(`${baseUrl}/api/presence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'claude', event: 'PreToolUse', tool: 'Bash', command: 'npm test' }),
    });

    const beforeRes = await fetch(`${baseUrl}/api/presence`);
    const beforeData = (await beforeRes.json()) as { presences: { agentId: string }[] };
    assert.ok(beforeData.presences.some((p) => p.agentId === 'claude'));

    const secondDir = await fs.mkdtemp(path.join(os.tmpdir(), 'synapse-sw-'));
    try {
      await fetch(`${baseUrl}/api/workspace/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceRoot: secondDir }),
      });

      const afterRes = await fetch(`${baseUrl}/api/presence`);
      const afterData = (await afterRes.json()) as { presences: unknown[] };
      assert.equal(afterData.presences.length, 0);
    } finally {
      await fs.rm(secondDir, { recursive: true, force: true });
    }
  });
});
