import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractInsights,
  extractMentions,
  nextMessageId,
  parseChatMd,
  serializeChatMd,
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
});
