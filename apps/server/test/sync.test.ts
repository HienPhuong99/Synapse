import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createSynapseServer } from '../src/app.js';

describe('Synapse Server Sync & Orchestrator', () => {
  let tmpDir: string;
  let closeServer: (() => Promise<void>) | undefined;
  let baseUrl: string;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'synapse-test-'));
    await fs.mkdir(path.join(tmpDir, 'examples'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'examples', 'demo.chat.md'),
      `---
schema: synapse/v1
title: "Integration Test Room"
mode: mention_and_round_robin
max_turns: 4
status: idle
agents:
  - id: architect
    name: "Architect"
    provider: simulator
    model: synapse-sim-1
    color: "#6366f1"
  - id: reviewer
    name: "Reviewer"
    provider: simulator
    model: synapse-sim-1
    color: "#f59e0b"
---

## [msg_01] @human · 2026-11-18T10:00:00+07:00
Hãy kiểm tra thiết kế @architect.
`,
      'utf8'
    );

    const { app } = await createSynapseServer({ workspaceRoot: tmpDir });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    if (!addr || typeof addr === 'string') throw new Error('Invalid server address');
    baseUrl = `http://127.0.0.1:${addr.port}`;
    closeServer = () => app.close();
  });

  after(async () => {
    if (closeServer) await closeServer();
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('lists initial sessions and reads document', async () => {
    const res = await fetch(`${baseUrl}/api/sessions`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { sessions: { filePath: string }[] };
    assert.equal(body.sessions.length, 1);
    assert.equal(body.sessions[0].filePath, 'examples/demo.chat.md');
  });

  it('posts a human message, edits it, and branches cleanly', async () => {
    const postRes = await fetch(`${baseUrl}/api/sessions/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: 'examples/demo.chat.md',
        content: 'Thêm chi tiết @reviewer',
        autoRun: false,
      }),
    });
    assert.equal(postRes.status, 200);
    const postData = (await postRes.json()) as { document: { messages: { id: string; content: string }[] } };
    assert.equal(postData.document.messages.length, 2);
    assert.equal(postData.document.messages[1].id, 'msg_02');

    const editRes = await fetch(`${baseUrl}/api/sessions/messages`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: 'examples/demo.chat.md',
        messageId: 'msg_02',
        content: 'Nội dung đã chỉnh sửa',
      }),
    });
    assert.equal(editRes.status, 200);
    const editData = (await editRes.json()) as { document: { messages: { content: string }[] } };
    assert.equal(editData.document.messages[1].content, 'Nội dung đã chỉnh sửa');

    const branchRes = await fetch(`${baseUrl}/api/sessions/branch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: 'examples/demo.chat.md',
        messageId: 'msg_01',
      }),
    });
    assert.equal(branchRes.status, 200);
    const branchData = (await branchRes.json()) as { document: { filePath: string; messages: unknown[] } };
    assert.equal(branchData.document.filePath, 'examples/demo.branch-1.chat.md');
    assert.equal(branchData.document.messages.length, 1);
  });

  it('runs a simulator AI turn and persists it to .chat.md', async () => {
    const ctrlRes = await fetch(`${baseUrl}/api/sessions/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: 'examples/demo.branch-1.chat.md',
        action: 'step',
        agentId: 'architect',
      }),
    });
    assert.equal(ctrlRes.status, 200);

    // Wait briefly for simulator stream to finish
    let msgsCount = 1;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 150));
      const docRes = await fetch(`${baseUrl}/api/sessions/doc?path=examples/demo.branch-1.chat.md`);
      const docData = (await docRes.json()) as { document: { messages: unknown[] } };
      msgsCount = docData.document.messages.length;
      if (msgsCount >= 2) break;
    }
    assert.equal(msgsCount, 2);
  });

  it('switches workspace dynamically and loads chat.md', async () => {
    const secondDir = await fs.mkdtemp(path.join(os.tmpdir(), 'synapse-zeroport-'));
    try {
      await fs.writeFile(
        path.join(secondDir, 'chat.md'),
        `# ZeroPort Test\n\n## 3. Thread\n\n### \`[Claude -> Gemini | 2026-11-18 10:20 +07]\` — Status: \`OPEN\`\nKiểm tra thử.\n`,
        'utf8'
      );

      const switchRes = await fetch(`${baseUrl}/api/workspace/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceRoot: secondDir }),
      });
      assert.equal(switchRes.status, 200);
      const data = (await switchRes.json()) as {
        workspaceRoot: string;
        sessions: { filePath: string; title: string }[];
      };
      assert.equal(data.sessions.length, 1);
      assert.equal(data.sessions[0].filePath, 'chat.md');
      assert.equal(data.sessions[0].title, 'ZeroPort Test');
    } finally {
      await fs.rm(secondDir, { recursive: true, force: true });
    }
  });
});
