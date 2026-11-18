import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { parseChatMd } from '@synapse/shared';
// Keep saved Claude sessions out of the real ~/.synapse while testing.
process.env.SYNAPSE_SESSIONS_FILE = path.join(os.tmpdir(), `synapse-sessions-${process.pid}.json`);
const { runCliProvider } = await import('../src/providers/cli.js');
import type { CliActivity, ProviderPromptContext } from '../src/providers/types.js';

// A fake `claude` on PATH that records its args/stdin and replays stream-json events.
const FAKE = `
import fs from 'node:fs';
const stdin = fs.readFileSync(0, 'utf8');
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ args: process.argv.slice(2), stdin }) + '\\n');
if (stdin.includes('SLOW')) { setTimeout(() => {}, 20000); }
else {
  const out = (o) => console.log(JSON.stringify(o));
  out({ type: 'system', subtype: 'init', session_id: 'sess-1' });
  out({ type: 'assistant', message: { content: [{ type: 'text', text: 'Để mình chạy test.' }] } });
  out({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'npm test' } }] } });
  out({ type: 'assistant', message: { content: [{ type: 'text', text: 'Xong, @gemini review nhé.' }] } });
  out({ type: 'result', is_error: false, session_id: 'sess-1', result: 'Xong, @gemini review nhé.',
        usage: { input_tokens: 10, cache_read_input_tokens: 5, output_tokens: 7 },
        permission_denials: [{ tool_name: 'Bash', tool_input: { command: 'rm -rf build' } }] });
}
`;

describe('CLI dispatcher provider', () => {
  let dir: string;
  let logFile: string;
  const oldPath = process.env.PATH;

  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'synapse-cli-'));
    logFile = path.join(dir, 'log.jsonl');
    await fs.writeFile(path.join(dir, 'fake.mjs'), FAKE);
    await fs.writeFile(path.join(dir, 'claude.cmd'), '@node "%~dp0fake.mjs" %*\r\n');
    await fs.writeFile(path.join(dir, 'claude'), `#!/bin/sh\nexec node "${path.join(dir, 'fake.mjs')}" "$@"\n`, { mode: 0o755 });
    await fs.writeFile(path.join(dir, 'gemini.cmd'), '@node "%~dp0fake.mjs" %*\r\n');
    await fs.writeFile(path.join(dir, 'gemini'), `#!/bin/sh\nexec node "${path.join(dir, 'fake.mjs')}" "$@"\n`, { mode: 0o755 });
    process.env.PATH = `${dir}${path.delimiter}${oldPath}`;
    process.env.FAKE_LOG = logFile;
  });

  after(async () => {
    process.env.PATH = oldPath;
    await fs.rm(dir, { recursive: true, force: true });
  });

  const makeCtx = (raw: string, signal = new AbortController().signal): ProviderPromptContext => {
    const document = parseChatMd(raw, 'chat.md');
    return { agent: document.meta.agents[0], document, fileExcerpts: [], settings: {}, signal, cwd: dir };
  };
  const board = '# Board\n\n### `[Gemini -> Claude | 2026-11-18 10:00 +07]`\n\nNhờ @claude sửa bug.\n';

  it('parses events, reports activity and denials, then resumes with only new messages', async () => {
    const ctx = makeCtx(board);
    assert.equal(ctx.agent.provider, 'gemini-cli'); // plain chat.md agents map to CLIs
    const claudeCtx = { ...ctx, agent: { ...ctx.agent, id: 'claude', provider: 'claude-code' as const, model: 'default' } };

    const activities: CliActivity[] = [];
    const res = await runCliProvider(claudeCtx, { onThinkingDelta() {}, onContentDelta() {}, onActivity: (a) => activities.push(a) }, 'claude');

    assert.match(res.content, /^Xong, @gemini review nhé\./);
    assert.match(res.content, /bị chặn quyền.*rm -rf build/);
    assert.match(res.thinking, /Để mình chạy test\.[\s\S]*→ Bash `npm test`/);
    assert.ok(!res.thinking.includes('Xong, @gemini'), 'final reply is not duplicated into thinking');
    assert.deepEqual(activities.map((a) => a.command), ['npm test']);
    assert.equal(res.tokensIn, 15);
    assert.equal(res.tokensOut, 7);

    // Second turn: same session is resumed and only messages after Claude's own reply are sent.
    const next = `${board}\n### \`[Claude -> Gemini | 2026-11-18 10:05 +07]\`\n\nOLD_REPLY\n\n### \`[Gemini -> Claude | 2026-11-18 10:09 +07]\`\n\nNEW_ASK\n`;
    const ctx2 = makeCtx(next);
    await runCliProvider({ ...ctx2, agent: claudeCtx.agent }, { onThinkingDelta() {}, onContentDelta() {} }, 'claude');

    const calls = (await fs.readFile(logFile, 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
    assert.ok(!calls[0].args.includes('--resume'));
    assert.deepEqual(calls[1].args.slice(calls[1].args.indexOf('--resume'), calls[1].args.indexOf('--resume') + 2), ['--resume', 'sess-1']);
    assert.ok(calls[1].stdin.includes('NEW_ASK') && !calls[1].stdin.includes('OLD_REPLY'));
    assert.ok(calls[0].args.includes('Bash(npm test*)'), 'allowlist survives Windows quoting');
  });

  it('kills the CLI process tree on abort', async () => {
    const ac = new AbortController();
    const ctx = makeCtx(board.replace('sửa bug', 'SLOW'), ac.signal);
    const started = Date.now();
    setTimeout(() => ac.abort(), 500);
    await assert.rejects(
      runCliProvider({ ...ctx, agent: { ...ctx.agent, id: 'claude2', provider: 'claude-code' } }, { onThinkingDelta() {}, onContentDelta() {} }, 'claude'),
      { name: 'AbortError' }
    );
    assert.ok(Date.now() - started < 8000, 'did not wait for the 20s fake to finish');
  });

  it('passes --skip-trust and --approval-mode auto_edit to gemini CLI', async () => {
    const beforeCount = (await fs.readFile(logFile, 'utf8')).trim().split('\n').filter(Boolean).length;
    const ctx = makeCtx(board);
    await runCliProvider(ctx, { onThinkingDelta() {}, onContentDelta() {} }, 'gemini');
    const calls = (await fs.readFile(logFile, 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
    const geminiCall = calls[beforeCount];
    assert.ok(geminiCall.args.includes('--skip-trust'), 'passes --skip-trust for worktrees/untrusted workspaces');
    assert.ok(geminiCall.args.includes('auto_edit'));
  });
});
