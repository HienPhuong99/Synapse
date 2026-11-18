import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { parseChatMd, type WsServerEvent } from '@synapse/shared';
import { createSynapseServer } from '../src/app.js';
import { hookReply, normalizeHookInput } from '../src/hook.js';
import { PresenceStore } from '../src/presence/store.js';

describe('PresenceStore & Hook Normalizer', () => {
  it('normalizes both Claude Code and Antigravity hook payloads', () => {
    const claude = normalizeHookInput(
      'claude',
      JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'npm test' },
        cwd: 'D:\\Code\\Synapse',
      })
    );
    assert.equal(claude.agent, 'claude');
    assert.equal(claude.source, 'claude-hook');
    assert.equal(claude.event, 'PreToolUse');
    assert.equal(claude.tool, 'Bash');
    assert.equal(claude.command, 'npm test');

    const agy = normalizeHookInput(
      'gemini',
      JSON.stringify({
        hookEventName: 'PreToolUse',
        toolCall: {
          name: 'read_file',
          args: { Path: 'D:\\Code\\Synapse\\chat.md' },
        },
        workspacePaths: ['D:\\Code\\Synapse'],
      })
    );
    assert.equal(agy.agent, 'gemini');
    assert.equal(agy.source, 'antigravity-hook');
    assert.equal(agy.tool, 'read_file');
    assert.equal(agy.path, 'D:\\Code\\Synapse\\chat.md');
  });

  it('tracks seenMessageId, typing, needs_approval alerts, and ETA', () => {
    const events: WsServerEvent[] = [];
    const store = new PresenceStore((ev) => events.push(ev));
    const doc = parseChatMd(
      `# Test\n\n## 3. Thread\n\n### \`[Claude | 2026-11-18 10:00 +07]\`\nHello\n\n### \`[Gemini | 2026-11-18 10:05 +07]\`\nETA: ~10 phút\n`,
      'chat.md'
    );

    const readP = store.ingest(
      { agent: 'claude', event: 'PreToolUse', tool: 'Read', path: 'D:\\Code\\Synapse\\chat.md' },
      [doc]
    );
    assert.equal(readP.status, 'working');
    assert.equal(readP.seenMessageId, 'msg_02');

    const writeP = store.ingest(
      { agent: 'claude', event: 'PreToolUse', tool: 'edit_file', path: 'D:\\Code\\Synapse\\chat.md' },
      [doc]
    );
    assert.equal(writeP.status, 'typing');
    assert.equal(writeP.detail, 'Đang ghi chat.md');

    const alertP = store.ingest({ agent: 'claude', event: 'Notification', detail: 'Chờ duyệt Bash' }, [doc]);
    assert.equal(alertP.status, 'needs_approval');
    assert.ok(events.some((e) => e.type === 'presence:alert' && e.agentId === 'claude'));

    const stopP = store.ingest({ agent: 'gemini', event: 'Stop' }, [doc]);
    assert.equal(stopP.status, 'idle');
    assert.equal(stopP.eta, '~10 phút');

    store.dispose();
  });
});

describe('Presence HTTP API', () => {
  let tmpDir: string;
  let baseUrl: string;
  let closeServer: () => Promise<void>;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'synapse-presence-'));
    await fs.writeFile(
      path.join(tmpDir, 'chat.md'),
      `# Test\n\n## 3. Thread\n\n### \`[Claude | 2026-11-18 11:00 +07]\`\nPing\n`,
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

  it('accepts POST /api/presence without Origin header and returns state in GET /api/presence', async () => {
    const postRes = await fetch(`${baseUrl}/api/presence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'gemini',
        event: 'PreToolUse',
        tool: 'read_file',
        path: path.join(tmpDir, 'chat.md'),
      }),
    });
    assert.equal(postRes.status, 200);
    const postData = (await postRes.json()) as { ok: boolean; presence: { seenMessageId?: string; status: string } };
    assert.equal(postData.ok, true);
    assert.equal(postData.presence.status, 'working');
    assert.equal(postData.presence.seenMessageId, 'msg_01');

    const getRes = await fetch(`${baseUrl}/api/presence`);
    assert.equal(getRes.status, 200);
    const getData = (await getRes.json()) as { presences: { agentId: string }[] };
    assert.equal(getData.presences.length, 1);
    assert.equal(getData.presences[0].agentId, 'gemini');
  });

  it('never blocks or auto-approves tools from the presence hook', () => {
    const agPre = JSON.stringify({ hookEventName: 'PreToolUse', toolCall: { name: 'run_command', args: { CommandLine: 'npm test' } } });
    assert.equal(hookReply(normalizeHookInput('gemini', agPre), agPre), '{"decision":"ask"}');
    const agPost = JSON.stringify({ hookEventName: 'PostToolUse', toolCall: { name: 'run_command', args: { CommandLine: 'npm test' } } });
    const post = normalizeHookInput('gemini', agPost);
    assert.equal(post.event, 'PreToolUse', 'Antigravity post-tool counts as activity');
    assert.equal(hookReply(post, agPost), '{}');
    const cc = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } });
    assert.equal(hookReply(normalizeHookInput('claude', cc), cc), '{}');
  });
});
