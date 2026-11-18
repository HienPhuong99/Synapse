import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { parseChatMd } from '@synapse/shared';
import { createSynapseServer } from '../src/app.js';
import { aggregateRanking, parseRanking } from '../src/orchestrator/engine.js';

describe('Council mode', () => {
  it('parses the last ranking line and averages positions', () => {
    const labels = ['A', 'B', 'C'];
    assert.deepEqual(parseRanking('bàn nháp XẾP HẠNG: A > B\n...\nXẾP HẠNG: c > a > Z > a', labels), ['C', 'A']);
    assert.equal(parseRanking('không có dòng xếp hạng', labels), null);
    const avg = aggregateRanking([['B', 'A', 'C'], ['A', 'B', 'C'], null, ['B', 'C']], labels);
    assert.deepEqual([...avg], [['A', 1.5], ['B', 4 / 3], ['C', 8 / 3]]);
  });

  let dir: string;
  let close: () => Promise<void>;
  let orchestrator: Awaited<ReturnType<typeof createSynapseServer>>['orchestrator'];
  const file = path.join('examples', 'c.chat.md');

  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'synapse-council-'));
    await fs.mkdir(path.join(dir, 'examples'));
    const agent = (id: string) => `  - id: ${id}\n    name: ${id}\n    provider: simulator\n    model: synapse-sim-1\n    color: "#000"\n`;
    await fs.writeFile(
      path.join(dir, file),
      `---\nschema: synapse/v1\ntitle: Council\nmode: manual\nmax_turns: 4\nstatus: idle\nagents:\n${agent('architect')}${agent('reviewer')}${agent('frontend')}---\n\n## [msg_01] @human · 2026-11-18T10:00:00+07:00\n\nNên lưu presence ở đâu?\n`
    );
    const server = await createSynapseServer({ workspaceRoot: dir });
    orchestrator = server.orchestrator;
    close = () => server.app.close();
  });

  after(async () => {
    await close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('runs all members, then writes only the chairman synthesis with the council log folded in', async () => {
    await orchestrator.runCouncil(file.replace(/\\/g, '/'), 'reviewer');
    const doc = parseChatMd(await fs.readFile(path.join(dir, file), 'utf8'));
    assert.equal(doc.messages.length, 2, 'one new turn only');
    const turn = doc.messages[1];
    assert.equal(turn.author, 'reviewer');
    assert.match(turn.thinking ?? '', /\*\*Hội đồng\*\* — 3\/3 thành viên trả lời, chủ toạ @reviewer\./);
    assert.match(turn.thinking ?? '', /#### A \(@architect\)[\s\S]*#### B \(@reviewer\)[\s\S]*#### C \(@frontend\)/);
    assert.match(turn.thinking ?? '', /#### Chấm chéo/);
    assert.equal(orchestrator.isRunning(file.replace(/\\/g, '/')), false);
  });
});
