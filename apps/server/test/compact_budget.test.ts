import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createSynapseServer } from '../src/app.js';

describe('Compact (#8) & Budget (#7)', () => {
  let tmpDir: string;
  let baseUrl: string;
  let closeServer: () => Promise<void>;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'synapse-compact-'));
    await fs.writeFile(
      path.join(tmpDir, 'chat.md'),
      `# Board

## 1. Tóm tắt lịch sử
- Mốc cũ.

## 2. Việc còn mở
- Việc A

---

## 3. Thread trao đổi

### \`[Claude | 2026-11-18 10:00 +07]\` — Status: \`DONE\`
Lượt 1.

### \`[Gemini | 2026-11-18 10:05 +07]\` — Status: \`DONE\`
Lượt 2.

### \`[Claude | 2026-11-18 10:10 +07]\` — Status: \`OPEN\`
Lượt 3.

### \`[Gemini | 2026-11-18 10:15 +07]\` — Status: \`OPEN\`
Lượt 4.
`,
      'utf8'
    );

    await fs.writeFile(
      path.join(tmpDir, 'budget.chat.md'),
      `---
schema: synapse/v1
title: "Budget Guardrail"
mode: round_robin
max_turns: 10
max_cost_usd: 0.005
status: idle
agents:
  - id: claude
    name: "Claude"
    provider: simulator
    model: claude-opus-5-5
    color: "#f59e0b"
---

## [msg_01] @human · 2026-11-18T10:00:00+07:00
Bắt đầu.

## [msg_02] @claude · 2026-11-18T10:01:00+07:00
<!-- synapse: {"id":"msg_02","model":"claude-opus-5-5","tokens_in":1000,"tokens_out":200,"cost_usd":0.01} -->
Đã vượt ngân sách.
`,
      'utf8'
    );

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

  it('compacts older turns into chat.archive.md and keeps the 2 newest turns', async () => {
    const res = await fetch(`${baseUrl}/api/sessions/compact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'chat.md', keepLatest: 2 }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      archivedCount: number;
      archivePath: string;
      document: { messages: { content: string }[] };
    };
    assert.equal(body.archivedCount, 2);
    assert.equal(body.archivePath, 'chat.archive.md');
    assert.equal(body.document.messages.length, 2);
    assert.equal(body.document.messages[0].content, 'Lượt 3.');
    assert.equal(body.document.messages[1].content, 'Lượt 4.');

    const archiveRaw = await fs.readFile(path.join(tmpDir, 'chat.archive.md'), 'utf8');
    assert.match(archiveRaw, /Lượt 1\./);
    assert.match(archiveRaw, /Lượt 2\./);
  });

  it('stops auto loop immediately when max_cost_usd budget is already reached', async () => {
    const ctrlRes = await fetch(`${baseUrl}/api/sessions/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'budget.chat.md', action: 'start' }),
    });
    assert.equal(ctrlRes.status, 200);

    await new Promise((r) => setTimeout(r, 300));
    const docRes = await fetch(`${baseUrl}/api/sessions/doc?path=budget.chat.md`);
    const docData = (await docRes.json()) as {
      document: { messages: unknown[] };
      insights: { totalCostUsd: number };
      orchestrator: { running: boolean };
    };
    assert.equal(docData.orchestrator.running, false);
    assert.equal(docData.document.messages.length, 2);
    assert.ok(docData.insights.totalCostUsd >= 0.01);
  });
});
