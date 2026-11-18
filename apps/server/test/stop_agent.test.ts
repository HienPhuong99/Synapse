import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createSynapseServer } from '../src/app.js';

test('stopAgentAndWait only stops runs of that agent', async () => {
  const ws = await fs.mkdtemp(path.join(os.tmpdir(), 'synapse-stop-'));
  const { app, orchestrator } = await createSynapseServer({ workspaceRoot: ws });
  try {
    const runs = (orchestrator as unknown as { activeRuns: Map<string, unknown> }).activeRuns;
    const mk = (agentId: string) => ({ controller: new AbortController(), turnCount: 1, looping: false, agentId, done: Promise.resolve() });
    const a = mk('claude');
    const b = mk('gemini');
    runs.set('a.chat.md', a);
    runs.set('b.chat.md', b);

    await orchestrator.stopAgentAndWait('Claude');
    assert.equal(a.controller.signal.aborted, true);
    assert.equal(b.controller.signal.aborted, false);
    assert.deepEqual([...runs.keys()], ['b.chat.md']);
    runs.clear();
  } finally {
    await app.close();
    await fs.rm(ws, { recursive: true, force: true });
  }
});
