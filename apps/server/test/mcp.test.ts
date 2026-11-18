import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createSynapseServer } from '../src/app.js';

describe('MCP board server', () => {
  let dir: string;
  let close: () => Promise<void>;
  let url: URL;
  const board = '# Board\n\n### `[Gemini | 2026-11-18 10:00 +07]`\n\nChào.\n';

  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'synapse-mcp-'));
    await fs.writeFile(path.join(dir, 'chat.md'), board);
    const { app } = await createSynapseServer({ workspaceRoot: dir });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address() as { port: number };
    url = new URL(`http://127.0.0.1:${addr.port}/mcp`);
    close = () => app.close();
  });

  after(async () => {
    await close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  const connect = async () => {
    const client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(url));
    return client;
  };
  const json = (r: any) => JSON.parse(r.content[0].text);

  it('posts a formatted turn, reads it back, and arbitrates file claims', async () => {
    const claude = await connect();
    const tools = (await claude.listTools()).tools.map((t) => t.name).sort();
    assert.deepEqual(tools, ['claim_files', 'post_message', 'read_thread', 'release_files']);

    await claude.callTool({ name: 'post_message', arguments: { agent: 'claude', to: 'gemini', status: 'OPEN', body: 'Nhờ @gemini review `src/a.ts`.' } });
    const raw = await fs.readFile(path.join(dir, 'chat.md'), 'utf8');
    assert.ok(raw.startsWith(board.trimEnd()), 'existing turns untouched');
    assert.match(raw, /### `\[Claude -> Gemini \| [^\]]+\]` — Status: `OPEN`\n\nNhờ @gemini review `src\/a.ts`\.\n$/);

    const thread = json(await claude.callTool({ name: 'read_thread', arguments: {} }));
    assert.equal(thread.messages.at(-1).author, 'claude');
    assert.equal(thread.messages.at(-1).to, 'gemini');

    const got = json(await claude.callTool({ name: 'claim_files', arguments: { agent: 'claude', paths: ['src/a.ts'] } }));
    assert.deepEqual(got.granted, ['src/a.ts']);

    const gemini = await connect();
    const clash = await gemini.callTool({ name: 'claim_files', arguments: { agent: 'gemini', paths: ['src\\A.ts', 'src/b.ts'] } });
    assert.equal(clash.isError, process.platform === 'win32'); // case-insensitive paths on Windows
    assert.deepEqual(json(clash).granted, process.platform === 'win32' ? ['src/b.ts'] : ['src\\A.ts', 'src/b.ts']);

    assert.equal(json(await claude.callTool({ name: 'release_files', arguments: { agent: 'claude' } })).released, 1);
    assert.equal(json(await gemini.callTool({ name: 'read_thread', arguments: { last: 1 } })).claims.length, process.platform === 'win32' ? 1 : 2);
  });

  it('is unreachable from a foreign web origin', async () => {
    const res = await fetch(url, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 403);
  });
});
