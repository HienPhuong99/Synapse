import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendMessageRaw,
  compactChatMdRaw,
  estimateCostUsd,
  extractInsights,
  extractMentions,
  nextMessageId,
  parseChatMd,
  replaceMessageRaw,
  serializeChatMd,
  setStatusRaw,
  truncateMessagesRaw,
} from '../src/chatmd.js';

const SAMPLE_MD = `---
schema: synapse/v1
title: "Thiết kế Sync Engine"
project_root: "."
mode: mention_and_round_robin
max_turns: 10
status: running
agents:
  - id: architect
    name: "Architect"
    provider: gemini
    model: gemini-2.5-pro
    color: "#6366f1"
  - id: reviewer
    name: "Reviewer"
    provider: anthropic
    model: claude-sonnet-4-5
    color: "#f59e0b"
---

## [msg_01] @human · 2026-11-18T09:45:00+07:00

Hãy bàn về file @file:apps/server/src/sync/watcher.ts nhé @architect.

## [msg_02] @architect · 2026-11-18T09:45:10+07:00

<!-- synapse: {"id":"msg_02","model":"gemini-2.5-pro","status":"done","tokens_in":120,"tokens_out":80} -->

<details data-synapse="thinking">
<summary>Quá trình suy nghĩ</summary>

Cần tránh heading giả trong code block.

</details>

Ví dụ markdown bên trong code block:

\`\`\`markdown
## @fake_heading_inside_code
@ignored_mention
\`\`\`

Chốt: Dùng WriteQueue theo đường dẫn file.
- [ ] Viết test cho EPERM retry

@reviewer kiểm tra giúp.
`;

describe('chat.md parser & serializer', () => {
  it('parses frontmatter, messages, thinking, and ignores headings/mentions inside code blocks', () => {
    const doc = parseChatMd(SAMPLE_MD, 'examples/sync.chat.md');
    assert.equal(doc.meta.title, 'Thiết kế Sync Engine');
    assert.equal(doc.meta.agents.length, 2);
    assert.equal(doc.messages.length, 2);

    assert.equal(doc.messages[0].author, 'human');
    assert.deepEqual(doc.messages[0].mentions, ['architect']);
    assert.deepEqual(doc.messages[0].fileRefs, ['apps/server/src/sync/watcher.ts']);

    const msg2 = doc.messages[1];
    assert.equal(msg2.author, 'architect');
    assert.equal(msg2.thinking, 'Cần tránh heading giả trong code block.');
    assert.equal(msg2.meta?.tokens_in, 120);
    assert.deepEqual(msg2.mentions, ['reviewer']);
  });

  it('round-trips through serializeChatMd cleanly', () => {
    const doc1 = parseChatMd(SAMPLE_MD, 'examples/sync.chat.md');
    const serialized = serializeChatMd(doc1);
    const doc2 = parseChatMd(serialized, 'examples/sync.chat.md');

    assert.equal(doc2.messages.length, 2);
    assert.equal(doc2.messages[1].thinking, doc1.messages[1].thinking);
    assert.equal(doc2.messages[1].content, doc1.messages[1].content);
    assert.equal(doc2.meta.title, doc1.meta.title);
  });

  it('extracts decisions, action items, tokens, and file refs', () => {
    const doc = parseChatMd(SAMPLE_MD, 'examples/sync.chat.md');
    const insights = extractInsights(doc);

    assert.equal(insights.decisions.length, 1);
    assert.equal(insights.decisions[0].text, 'Dùng WriteQueue theo đường dẫn file.');
    assert.equal(insights.actionItems.length, 1);
    assert.equal(insights.actionItems[0].text, 'Viết test cho EPERM retry');
    assert.equal(insights.totalTokensIn, 120);
    assert.equal(insights.totalTokensOut, 80);
    assert.deepEqual(insights.referencedFiles, ['apps/server/src/sync/watcher.ts']);
  });

  it('computes sequential message ids and ignores code mentions', () => {
    const doc = parseChatMd(SAMPLE_MD);
    assert.equal(nextMessageId(doc.messages), 'msg_03');
    assert.deepEqual(extractMentions('Hello `@ignored` and @valid_agent'), ['valid_agent']);
  });

  it('parses and round-trips ZeroPort-style thread chat.md cleanly', () => {
    const zeroPortSample = `# ZeroPort — Bảng trao đổi AI (\`chat.md\`)

## 3. Thread trao đổi

### \`[Claude -> Gemini | 2026-11-18 09:45 +07]\` — Status: Review \`FIXED\`
- Đã sửa \`src/view.ts:69\` và \`src/style.css:79\`.
- \`npm run check\` ✔

### \`[Gemini -> Claude | 2026-11-18 09:50 +07]\` — Status: \`AGREED\`
Xác nhận ổn.
`;
    const doc = parseChatMd(zeroPortSample, 'chat.md');
    assert.equal(doc.meta.schema, 'thread-md/v1');
    assert.equal(doc.meta.title, 'ZeroPort — Bảng trao đổi AI (`chat.md`)');
    assert.equal(doc.meta.agents.length, 2);
    assert.equal(doc.messages.length, 2);
    assert.equal(doc.messages[0].author, 'claude');
    assert.deepEqual(doc.messages[0].mentions, ['gemini']);
    assert.deepEqual(doc.messages[0].fileRefs, ['src/view.ts', 'src/style.css']);

    const roundTrip = serializeChatMd(doc);
    assert.equal(roundTrip.startsWith('---'), false);
    assert.match(roundTrip, /### `\[Claude -> Gemini \| 2026-11-18 09:45 \+07\]` — Status: Review `FIXED`/);
  });

  it('patches raw text without touching what other agents wrote', () => {
    const thread = [
      '# Board',
      '',
      '### `[Claude | 2026-11-18 09:55 +07]` — Status: `OPEN`',
      '',
      'Plan, nhờ @gemini review.',
      '',
      '### `[Gemini CLI -> Claude | 2026-11-18 10:05 +07]` — `AGREED`',
      'OK.',
      '',
    ].join('\r\n');
    const msg = { id: 'x', author: 'human', timestamp: '', content: 'Tiếp nhé', mentions: [], fileRefs: [] };

    // append: original bytes stay a verbatim prefix, CRLF kept, heading has no guessed target
    const appended = appendMessageRaw(thread, msg);
    assert.ok(appended.startsWith(thread.trimEnd()));
    assert.ok(!/[^\r]\n/.test(appended), 'stays CRLF');
    assert.match(appended, /### `\[Chủ máy \| [^\]]+\]`\r\n\r\nTiếp nhé\r\n$/);
    assert.equal(parseChatMd(appended).messages.length, 3);

    // replace: only the body of msg_02 changes, its odd heading survives verbatim
    const edited = replaceMessageRaw(thread, 'msg_02', { ...parseChatMd(thread).messages[1], content: 'Đã sửa' });
    assert.equal(edited, thread.replace('OK.', '\r\nĐã sửa'));

    // truncate
    assert.equal(truncateMessagesRaw(thread, 'msg_02', false), thread.split('\r\n\r\n### `[Gemini')[0] + '\r\n');
    assert.equal(truncateMessagesRaw(thread, 'msg_02', true), thread);

    // status: unknown frontmatter keys and the body are kept
    const fm = '---\nschema: synapse/v1\ncustom_key: 1\nstatus: idle\n---\n\n## [msg_01] @human\nhi\n';
    assert.equal(setStatusRaw(fm, 'running'), fm.replace('status: idle', 'status: running'));
    assert.equal(setStatusRaw(thread, 'running'), thread);
  });

  it('compacts older turns cleanly and computes per-agent token cost', () => {
    const raw = [
      '# Board',
      '',
      '## 1. Tóm tắt lịch sử',
      '- Mốc 0',
      '- Mốc 0b',
      '',
      '## 2. Việc còn mở',
      '- Việc X',
      '',
      '## 3. Thread',
      '',
      '### `[Claude | 2026-11-18 10:00 +07]` — `DONE`',
      'Tin 1',
      '',
      '### `[Gemini | 2026-11-18 10:05 +07]` — `DONE`',
      'Tin 2',
      '',
      '### `[Claude | 2026-11-18 10:10 +07]` — `OPEN`',
      'Tin 3',
      '',
      '### `[Gemini | 2026-11-18 10:15 +07]` — `OPEN`',
      'Tin 4',
    ].join('\n');

    const res = compactChatMdRaw(raw, 2);
    assert.ok(res);
    assert.equal(res.archivedCount, 2);
    assert.match(res.archivedText, /Tin 1/);
    assert.match(res.archivedText, /Tin 2/);
    assert.equal(parseChatMd(res.compacted).messages.length, 2);
    assert.match(res.compacted, /## 2\. Việc còn mở\n- Việc X/);
    assert.match(res.compacted, /\*\*@claude \(2026-11-18 10:00 \+07\):\*\* DONE/);
    assert.match(res.compacted, /- Mốc 0b\n- \*\*@claude/, 'summary goes at the end of section 1');
    assert.equal(compactChatMdRaw(raw, 0)?.archivedCount, 2, 'bad keepLatest falls back to 2');

    assert.equal(estimateCostUsd('synapse-sim-1', 'simulator', 1000, 1000), 0);
    assert.ok(estimateCostUsd('claude-opus-5-5', 'anthropic', 1_000_000, 0) === 5);

    const fmBudget = [
      '---',
      'schema: synapse/v1',
      'title: "Budget Compact"',
      'mode: round_robin',
      'max_turns: 10',
      'max_cost_usd: 0.05',
      'status: idle',
      'agents:',
      '  - id: claude',
      '    name: "Claude"',
      '    provider: anthropic',
      '    model: claude-opus-5-5',
      '    color: "#f59e0b"',
      '---',
      '',
      '## [msg_01] @claude · 2026-11-18T10:00:00+07:00',
      '<!-- synapse: {"id":"msg_01","cost_usd":0.03} -->',
      'Lượt 1',
      '',
      '## [msg_02] @claude · 2026-11-18T10:01:00+07:00',
      '<!-- synapse: {"id":"msg_02","cost_usd":0.02} -->',
      'Lượt 2',
    ].join('\n');

    const compactedFm = compactChatMdRaw(fmBudget, 1);
    assert.ok(compactedFm);
    const parsedCompacted = parseChatMd(compactedFm.compacted);
    assert.equal(parsedCompacted.meta.spent_usd_archived, 0.03);
    assert.ok(Math.abs(extractInsights(parsedCompacted).totalCostUsd - 0.05) < 1e-6);
  });
});
