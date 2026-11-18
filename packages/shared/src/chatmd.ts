import yaml from 'js-yaml';
import type {
  ActionItem,
  AgentConfig,
  AgentUsageStats,
  ChatDocument,
  ChatMessage,
  ChatSessionMeta,
  DecisionItem,
  InsightsSummary,
  MessageMeta,
  ProviderKind,
} from './types.js';

const DEFAULT_META: ChatSessionMeta = {
  schema: 'synapse/v1',
  title: 'Untitled Discussion',
  project_root: '.',
  mode: 'mention_and_round_robin',
  max_turns: 12,
  status: 'idle',
  agents: [],
};

const AGENT_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6'];

// A plain chat.md is a board shared by real coding agents, so its known authors are dispatched to
// their CLIs (they can read/edit code) rather than the chat-only APIs. model 'default' = the CLI's own.
const KNOWN_THREAD_AGENTS: Record<string, Partial<AgentConfig>> = {
  claude: {
    id: 'claude',
    name: 'Claude',
    role: 'Claude Code CLI',
    provider: 'claude-code',
    model: 'default',
    color: '#f59e0b',
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    role: 'Gemini CLI',
    provider: 'gemini-cli',
    model: 'default',
    color: '#6366f1',
  },
};

export function isChatMdFilename(fileNameOrPath: string): boolean {
  const normalized = fileNameOrPath.replace(/\\/g, '/').toLowerCase();
  const base = normalized.split('/').pop() ?? '';
  return base === 'chat.md' || base.endsWith('.chat.md');
}

/**
 * Strip fenced code blocks and inline code before extracting @mentions or @file refs
 * so code snippets do not accidentally trigger agents.
 */
export function stripCodeForMentions(markdown: string): string {
  const withoutFences = removeFencedCodeBlocks(markdown);
  const withoutDetails = withoutFences.replace(/<details[\s\S]*?<\/details>/gi, '');
  return withoutDetails.replace(/`[^`\n]+`/g, '');
}

function removeFencedCodeBlocks(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const kept: string[] = [];
  let activeFence: { char: string; len: number } | null = null;

  for (const line of lines) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      const char = marker[0];
      const len = marker.length;
      if (!activeFence) {
        activeFence = { char, len };
        continue;
      }
      if (activeFence.char === char && len >= activeFence.len) {
        activeFence = null;
        continue;
      }
    }
    if (!activeFence) {
      kept.push(line);
    }
  }
  return kept.join('\n');
}

export function extractMentions(markdown: string): string[] {
  const clean = stripCodeForMentions(markdown);
  const matches = clean.matchAll(/(?:^|[\s(])@([a-zA-Z0-9_-]+)/g);
  const seen = new Set<string>();
  for (const m of matches) {
    const id = m[1];
    if (id.toLowerCase() !== 'file') {
      seen.add(id);
    }
  }
  return Array.from(seen);
}

export function extractFileRefs(markdown: string): string[] {
  const clean = removeFencedCodeBlocks(markdown);
  const seen = new Set<string>();

  // Explicit @file:path/to/file.ts
  for (const m of clean.matchAll(/@file:([^\s),;`"']+)/g)) {
    seen.add(m[1].replace(/\\/g, '/').replace(/:\d+(?:-\d+)?$/, ''));
  }

  // Backticked repo relative paths like `src/view.ts:69` or `electron/lan.js`
  for (const m of clean.matchAll(/`([a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+\.[a-zA-Z0-9]+)(?::\d+(?:-\d+)?)?`/g)) {
    const candidate = m[1];
    if (!candidate.startsWith('http') && !candidate.includes('..')) {
      seen.add(candidate);
    }
  }

  return Array.from(seen);
}

function normalizeAgent(raw: Partial<AgentConfig>, idx: number): AgentConfig {
  const id = String(raw.id || `agent_${idx + 1}`).trim();
  return {
    id,
    name: String(raw.name || id),
    role: raw.role ? String(raw.role) : undefined,
    provider: (raw.provider as AgentConfig['provider']) || 'simulator',
    model: String(raw.model || 'synapse-sim-1'),
    color: String(raw.color || AGENT_COLORS[idx % AGENT_COLORS.length]),
    system_prompt: raw.system_prompt ? String(raw.system_prompt) : undefined,
  };
}

function parseFrontmatter(raw: string): { hasFrontmatter: boolean; meta: ChatSessionMeta; body: string } {
  const normalized = raw.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return {
      hasFrontmatter: false,
      meta: { ...DEFAULT_META, agents: [] },
      body: normalized,
    };
  }

  let parsed: Record<string, unknown> = {};
  try {
    const loaded = yaml.load(match[1]);
    if (loaded && typeof loaded === 'object' && !Array.isArray(loaded)) {
      parsed = loaded as Record<string, unknown>;
    }
  } catch {
    parsed = {};
  }

  const rawAgents = Array.isArray(parsed.agents) ? parsed.agents : [];
  const agents = rawAgents
    .filter((a): a is Record<string, unknown> => Boolean(a && typeof a === 'object'))
    .map((a, idx) => normalizeAgent(a as Partial<AgentConfig>, idx));

  const meta: ChatSessionMeta = {
    ...DEFAULT_META,
    ...parsed,
    schema: String(parsed.schema || DEFAULT_META.schema),
    title: String(parsed.title || DEFAULT_META.title),
    project_root: parsed.project_root ? String(parsed.project_root) : '.',
    mode: (parsed.mode as ChatSessionMeta['mode']) || DEFAULT_META.mode,
    max_turns: typeof parsed.max_turns === 'number' && parsed.max_turns > 0 ? parsed.max_turns : DEFAULT_META.max_turns,
    status: (parsed.status as ChatSessionMeta['status']) || DEFAULT_META.status,
    agents,
  };

  return { hasFrontmatter: true, meta, body: match[2] };
}

interface RawHeadingMatch {
  id: string;
  author: string;
  target?: string;
  timestamp: string;
  headingSuffix?: string;
}

function parseMessageHeading(line: string, fallbackIndex: number): RawHeadingMatch | null {
  // Primary Synapse format: ## [msg_01] @architect · 2026-11-18T09:45:00+07:00
  const primary = line.match(/^##\s+\[([^\]]+)\]\s+@?([^\s·|]+)(?:\s*[·|]\s*(.+))?$/);
  if (primary) {
    return {
      id: primary[1].trim(),
      author: primary[2].trim(),
      timestamp: (primary[3] || '').trim(),
    };
  }

  // Flexible chat.md format: ## @architect · 2026-11-18...
  const flex = line.match(/^##\s+@([a-zA-Z0-9_.-]+)(?:\s*[·|]\s*(.+))?$/);
  if (flex) {
    return {
      id: `msg_${String(fallbackIndex).padStart(2, '0')}`,
      author: flex[1].trim(),
      timestamp: (flex[2] || '').trim(),
    };
  }

  return null;
}

/**
 * Matches ZeroPort-style H3 thread headings, e.g.:
 * ### `[Claude -> Gemini | 2026-11-17 22:20 +07]` — Status: M7 `OPEN`
 * ### `[Claude | 2026-11-18 09:55 +07]` — Unslop UI: `AGREED` → `DONE`
 */
function parseThreadH3Heading(line: string, fallbackIndex: number): RawHeadingMatch | null {
  const m = line.match(/^###\s+`?\[([^\]|`]+?)(?:\s*\|\s*([^\]`]+))?\]`?(?:\s*[—\-–]+\s*(.+))?$/);
  if (!m) return null;

  const actorExpr = m[1].trim();
  const timestamp = (m[2] ?? '').trim();
  const headingSuffix = m[3]?.trim() || undefined;

  let authorRaw = actorExpr;
  let targetRaw: string | undefined;
  const arrowMatch = actorExpr.match(/^(.+?)\s*(?:->|→)\s*(.+)$/);
  if (arrowMatch) {
    authorRaw = arrowMatch[1].trim();
    targetRaw = arrowMatch[2].trim();
  }

  const author = authorRaw.replace(/^@/, '').toLowerCase().replace(/\s+/g, '_');
  const target = targetRaw ? targetRaw.replace(/^@/, '').toLowerCase().replace(/\s+/g, '_') : undefined;

  return {
    id: `msg_${String(fallbackIndex).padStart(2, '0')}`,
    author,
    target,
    timestamp,
    headingSuffix,
  };
}

function parseMessageBody(rawLines: string[], heading: RawHeadingMatch): ChatMessage {
  const lines = [...rawLines];
  let meta: MessageMeta | undefined;

  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }

  if (lines.length > 0) {
    const metaMatch = lines[0].match(/^<!--\s*synapse:\s*(\{[\s\S]*?\})\s*-->$/);
    if (metaMatch) {
      try {
        meta = JSON.parse(metaMatch[1]) as MessageMeta;
      } catch {
        // Ignore malformed metadata comment
      }
      lines.shift();
      while (lines.length > 0 && lines[0].trim() === '') {
        lines.shift();
      }
    }
  }

  let bodyText = lines.join('\n').trim();
  let thinking: string | undefined;

  const thinkingMatch = bodyText.match(
    /^<details(?:\s+data-synapse="thinking")?\s*>\s*<summary>[\s\S]*?<\/summary>\s*([\s\S]*?)\s*<\/details>\s*/i
  );
  if (thinkingMatch) {
    thinking = thinkingMatch[1].trim();
    bodyText = bodyText.slice(thinkingMatch[0].length).trim();
  }

  if (heading.headingSuffix || heading.target) {
    meta = {
      id: meta?.id || heading.id,
      ...meta,
      headingSuffix: heading.headingSuffix ?? meta?.headingSuffix,
      target: heading.target ?? meta?.target,
    };
  }

  const id = meta?.id || heading.id;
  const mentionsSet = new Set(extractMentions(bodyText));
  if (heading.target && heading.target !== 'human' && heading.target !== 'user') {
    mentionsSet.add(heading.target);
  }
  const fileRefs = Array.from(new Set([...(meta?.refs || []), ...extractFileRefs(bodyText)]));

  return {
    id,
    author: heading.author,
    timestamp: heading.timestamp,
    thinking,
    content: bodyText,
    meta,
    mentions: Array.from(mentionsSet),
    fileRefs,
  };
}

function inferAgentsFromMessages(messages: ChatMessage[]): AgentConfig[] {
  const seen = new Map<string, AgentConfig>();
  let idx = 0;
  // Authors, plus known agents that were only addressed so far (heading target or @mention).
  const candidates = messages.flatMap((m) => [m.author, ...m.mentions.filter((x) => KNOWN_THREAD_AGENTS[x.toLowerCase()])]);
  for (const raw of candidates) {
    const id = raw.toLowerCase();
    if (id === 'human' || id === 'user' || seen.has(id)) continue;
    const preset = KNOWN_THREAD_AGENTS[id];
    if (preset) {
      seen.set(id, normalizeAgent(preset, idx++));
    } else {
      seen.set(
        id,
        normalizeAgent(
          {
            id,
            name: id.charAt(0).toUpperCase() + id.slice(1),
            provider: 'simulator',
            model: 'external-agent',
          },
          idx++
        )
      );
    }
  }
  return Array.from(seen.values());
}

interface ScannedBlock {
  heading: RawHeadingMatch;
  lines: string[];
  /** Offsets into the LF-normalized raw text. */
  start: number;
  headingEnd: number;
  end: number;
}

function scanChatMd(raw: string) {
  const { hasFrontmatter, meta, body } = parseFrontmatter(raw);
  const text = raw.replace(/\r\n/g, '\n');
  const lines = body.split('\n');

  // No frontmatter and no Synapse H2 messages → ZeroPort-style H3 thread chat.md
  // (also for an empty template, so the first appended message uses the thread format).
  const hasH2Msg = lines.some((l) => Boolean(parseMessageHeading(l, 1)));
  const hasH3ThreadMsg = !hasFrontmatter && !hasH2Msg;

  const preambleLines: string[] = [];
  const blocks: ScannedBlock[] = [];

  let currentBlock: ScannedBlock | null = null;
  let activeFence: { char: string; len: number } | null = null;
  let offset = text.length - body.length;

  for (const line of lines) {
    const lineStart = offset;
    offset += line.length + 1;
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      const char = marker[0];
      const len = marker.length;
      if (!activeFence) {
        activeFence = { char, len };
      } else if (activeFence.char === char && len >= activeFence.len) {
        activeFence = null;
      }
    }

    if (!activeFence) {
      const heading: RawHeadingMatch | null = hasH3ThreadMsg
        ? line.startsWith('### ')
          ? parseThreadH3Heading(line, blocks.length + (currentBlock ? 2 : 1))
          : null
        : line.startsWith('## ')
          ? parseMessageHeading(line, blocks.length + (currentBlock ? 2 : 1))
          : null;

      if (heading) {
        if (currentBlock) {
          currentBlock.end = lineStart;
          blocks.push(currentBlock);
        }
        currentBlock = { heading, lines: [], start: lineStart, headingEnd: lineStart + line.length, end: text.length };
        continue;
      }
    }

    if (currentBlock) {
      currentBlock.lines.push(line);
    } else {
      preambleLines.push(line);
    }
  }

  if (currentBlock) {
    blocks.push(currentBlock);
  }

  const messages = blocks.map((b) => parseMessageBody(b.lines, b.heading));
  return { text, hasFrontmatter, meta, preamble: preambleLines.join('\n').trim(), hasH3ThreadMsg, blocks, messages };
}

export function parseChatMd(raw: string, filePath = ''): ChatDocument {
  const { meta, preamble, hasH3ThreadMsg, messages } = scanChatMd(raw);

  if (hasH3ThreadMsg) {
    const h1Match = preamble.match(/^#\s+(.+)$/m);
    const title = h1Match ? h1Match[1].trim() : filePath || 'Project chat.md';
    const agents = meta.agents.length > 0 ? meta.agents : inferAgentsFromMessages(messages);
    return {
      filePath: filePath.replace(/\\/g, '/'),
      raw,
      meta: {
        ...meta,
        schema: 'thread-md/v1',
        title,
        mode: 'mention',
        agents,
      },
      preamble,
      messages,
    };
  }

  return {
    filePath: filePath.replace(/\\/g, '/'),
    raw,
    meta,
    preamble,
    messages,
  };
}

function formatAuthorLabel(id: string): string {
  const lower = id.toLowerCase();
  if (lower === 'claude') return 'Claude';
  if (lower === 'gemini') return 'Gemini';
  if (lower === 'human') return 'Chủ máy';
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function formatThreadTimestamp(ts: string): string {
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(ts)) {
    return ts;
  }
  const d = ts ? new Date(ts) : new Date();
  if (Number.isNaN(d.getTime())) return ts;
  const pad = (n: number) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const tz = `${off >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(off) / 60))}${Math.abs(off) % 60 ? `:${pad(Math.abs(off) % 60)}` : ''}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} ${tz}`;
}

function serializeMessage(msg: ChatMessage, thread: boolean): { heading: string; body: string } {
  let heading: string;
  const bodyParts: string[] = [];
  if (thread) {
    const authorLabel = formatAuthorLabel(msg.author);
    // Only an explicit target goes into the heading; never guess it from body mentions.
    const actorPart = msg.meta?.target ? `${authorLabel} -> ${formatAuthorLabel(msg.meta.target)}` : authorLabel;
    const suffixPart = msg.meta?.headingSuffix ? ` — ${msg.meta.headingSuffix}` : '';
    heading = `### \`[${actorPart} | ${formatThreadTimestamp(msg.timestamp)}]\`${suffixPart}`;
  } else {
    heading = `## [${msg.id}] @${msg.author}${msg.timestamp ? ` · ${msg.timestamp}` : ''}`;
    if (msg.meta && Object.keys(msg.meta).length > 0) {
      bodyParts.push(`<!-- synapse: ${JSON.stringify(msg.meta)} -->`);
    }
  }
  if (msg.thinking && msg.thinking.trim()) {
    bodyParts.push(
      `<details data-synapse="thinking">\n<summary>Quá trình suy nghĩ</summary>\n\n${msg.thinking.trim()}\n\n</details>`
    );
  }
  if (msg.content && msg.content.trim()) {
    bodyParts.push(msg.content.trim());
  }
  return { heading, body: bodyParts.join('\n\n') };
}

function serializeBlock(msg: ChatMessage, thread: boolean): string {
  const { heading, body } = serializeMessage(msg, thread);
  return body ? `${heading}\n\n${body}` : heading;
}

// ---- Raw patch helpers: change only the bytes that must change, so text written by
// other agents/editors (headings, spacing, unknown frontmatter keys, CRLF) survives.

function withEol(raw: string, edit: (text: string) => string): string {
  const out = edit(raw.replace(/\r\n/g, '\n'));
  return raw.includes('\r\n') ? out.replace(/\n/g, '\r\n') : out;
}

function findBlockIndex(scan: ReturnType<typeof scanChatMd>, messageId: string): number {
  const idx = scan.messages.findIndex((m) => m.id === messageId);
  if (idx === -1) throw new Error(`Không tìm thấy tin nhắn ${messageId}`);
  return idx;
}

export function appendMessageRaw(raw: string, msg: ChatMessage): string {
  const scan = scanChatMd(raw);
  return withEol(raw, (text) => {
    const head = text.trimEnd();
    return `${head}${head ? '\n\n' : ''}${serializeBlock(msg, scan.hasH3ThreadMsg)}\n`;
  });
}

/** Replaces one message's body; its original heading line is kept verbatim. */
export function replaceMessageRaw(raw: string, messageId: string, msg: ChatMessage): string {
  const scan = scanChatMd(raw);
  const block = scan.blocks[findBlockIndex(scan, messageId)];
  return withEol(raw, (text) => {
    const trailing = text.slice(block.start, block.end).match(/\s*$/)?.[0] ?? '';
    const { body } = serializeMessage(msg, scan.hasH3ThreadMsg);
    return `${text.slice(0, block.headingEnd)}${body ? `\n\n${body}` : ''}${trailing}${text.slice(block.end)}`;
  });
}

/** Drops everything from the given message (keep=false) or after it (keep=true). */
export function truncateMessagesRaw(raw: string, messageId: string, keep: boolean): string {
  const scan = scanChatMd(raw);
  const idx = findBlockIndex(scan, messageId);
  const cut = keep ? (scan.blocks[idx + 1]?.start ?? scan.text.length) : scan.blocks[idx].start;
  return withEol(raw, (text) => `${text.slice(0, cut).trimEnd()}\n`);
}

function setFrontmatterFieldRaw(text: string, key: string, value: string): string {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return text;
  const lineRe = new RegExp(`^${key}:.*$`, 'm');
  const fm = lineRe.test(m[1]) ? m[1].replace(lineRe, `${key}: ${value}`) : `${m[1]}\n${key}: ${value}`;
  return `---\n${fm}\n---${text.slice(m[0].length)}`;
}

/** Sets `status:` in YAML frontmatter; files without frontmatter are returned unchanged. */
export function setStatusRaw(raw: string, status: ChatSessionMeta['status']): string {
  return withEol(raw, (text) => setFrontmatterFieldRaw(text, 'status', status));
}

/**
 * Archives all turns except the newest `keepLatest` turns into a verbatim archive chunk,
 * and appends a 1-line summary of each archived turn under `## 1. Tóm tắt lịch sử`.
 */
export function compactChatMdRaw(
  raw: string,
  keepLatest = 2
): { compacted: string; archivedText: string; archivedCount: number } | null {
  keepLatest = Math.max(1, Math.floor(keepLatest) || 2);
  const scan = scanChatMd(raw);
  if (scan.blocks.length <= keepLatest) return null;

  const cutIdx = scan.blocks.length - keepLatest;
  const archivedBlocks = scan.blocks.slice(0, cutIdx);
  const archivedMessages = scan.messages.slice(0, cutIdx);
  const firstKeptStart = scan.blocks[cutIdx].start;

  const archivedText = archivedBlocks
    .map((b) => scan.text.slice(b.start, b.end).trim())
    .filter(Boolean)
    .join('\n\n');

  const summaryLines = archivedMessages.map((msg) => {
    const ts = msg.timestamp ? ` (${msg.timestamp})` : '';
    const suffix = msg.meta?.headingSuffix ? `${msg.meta.headingSuffix.replace(/`/g, '')}` : '';
    const snippet = msg.content.replace(/\s+/g, ' ').trim().slice(0, 90);
    return `- **@${msg.author}${ts}:** ${suffix || snippet || '(trống)'}`;
  });

  const headPart = scan.text.slice(0, scan.blocks[0].start).trimEnd();
  const keptTail = scan.text.slice(firstKeptStart).trimStart();

  let updatedHead = headPart;
  const { hasFrontmatter, meta } = parseFrontmatter(scan.text);
  if (hasFrontmatter) {
    const agentMap = new Map(meta.agents.map((a) => [a.id.toLowerCase(), a]));
    let archivedCost = 0;
    for (const msg of archivedMessages) {
      const cfg = agentMap.get(msg.author.toLowerCase());
      archivedCost += estimateCostUsd(
        msg.meta?.model ?? cfg?.model,
        msg.meta?.provider ?? cfg?.provider,
        msg.meta?.tokens_in ?? 0,
        msg.meta?.tokens_out ?? 0,
        msg.meta?.cost_usd
      );
    }
    if (archivedCost > 0) {
      const prevArchived = typeof meta.spent_usd_archived === 'number' && meta.spent_usd_archived > 0 ? meta.spent_usd_archived : 0;
      const totalArchived = Number((prevArchived + archivedCost).toFixed(6));
      updatedHead = setFrontmatterFieldRaw(updatedHead, 'spent_usd_archived', String(totalArchived));
    }
  }

  const summaryHeading = /(^##\s+1\.\s+[^\n]*\n)([\s\S]*?)(?=\n##\s+2\.|\n---|\s*(?![\s\S]))/m;
  if (summaryHeading.test(updatedHead)) {
    updatedHead = updatedHead.replace(summaryHeading, (_all, hdr: string, body: string) => {
      const cleanBody = body.trimEnd();
      return `${hdr}${cleanBody ? `${cleanBody}\n` : ''}${summaryLines.join('\n')}`;
    });
  } else {
    updatedHead = `${updatedHead}${updatedHead ? '\n\n' : ''}## 1. Tóm tắt lịch sử\n${summaryLines.join('\n')}`;
  }

  const out = `${updatedHead.trimEnd()}\n\n${keptTail.trimEnd()}\n`;
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  return {
    compacted: eol === '\r\n' ? out.replace(/\n/g, '\r\n') : out,
    archivedText: eol === '\r\n' ? archivedText.replace(/\n/g, '\r\n') : archivedText,
    archivedCount: archivedBlocks.length,
  };
}

export function serializeChatMd(doc: ChatDocument): string {
  if (doc.meta.schema === 'thread-md/v1') {
    const parts: string[] = [];
    if (doc.preamble && doc.preamble.trim()) {
      parts.push(doc.preamble.trim());
    }
    for (const msg of doc.messages) {
      parts.push(serializeBlock(msg, true));
    }
    return parts.join('\n\n') + '\n';
  }

  const cleanMeta: Record<string, unknown> = {
    schema: doc.meta.schema || 'synapse/v1',
    title: doc.meta.title || 'Untitled Discussion',
    project_root: doc.meta.project_root || '.',
    mode: doc.meta.mode || 'mention_and_round_robin',
    max_turns: doc.meta.max_turns || 12,
    ...(typeof doc.meta.max_cost_usd === 'number' && doc.meta.max_cost_usd > 0
      ? { max_cost_usd: doc.meta.max_cost_usd }
      : {}),
    ...(typeof doc.meta.spent_usd_archived === 'number' && doc.meta.spent_usd_archived > 0
      ? { spent_usd_archived: doc.meta.spent_usd_archived }
      : {}),
    status: doc.meta.status || 'idle',
    agents: doc.meta.agents.map((a) => {
      const out: Record<string, unknown> = {
        id: a.id,
        name: a.name,
        provider: a.provider,
        model: a.model,
        color: a.color,
      };
      if (a.role) out.role = a.role;
      if (a.system_prompt) out.system_prompt = a.system_prompt;
      return out;
    }),
  };

  const frontmatter = yaml
    .dump(cleanMeta, {
      lineWidth: 120,
      noRefs: true,
      quotingType: '"',
    })
    .trimEnd();

  const parts: string[] = [`---\n${frontmatter}\n---`];

  if (doc.preamble && doc.preamble.trim()) {
    parts.push(doc.preamble.trim());
  }

  for (const msg of doc.messages) {
    parts.push(serializeBlock(msg, false));
  }

  return parts.join('\n\n') + '\n';
}

export function nextMessageId(messages: ChatMessage[]): string {
  let maxNum = 0;
  for (const m of messages) {
    const match = m.id.match(/(\d+)$/);
    if (match) {
      const n = Number.parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  return `msg_${String(maxNum + 1).padStart(2, '0')}`;
}

export function estimateCostUsd(
  model: string | undefined,
  provider: ProviderKind | undefined,
  tokensIn = 0,
  tokensOut = 0,
  explicitCostUsd?: number
): number {
  if (typeof explicitCostUsd === 'number' && Number.isFinite(explicitCostUsd) && explicitCostUsd >= 0) {
    return explicitCostUsd;
  }
  if (provider === 'simulator' || provider === 'ollama') return 0;
  if (tokensIn === 0 && tokensOut === 0) return 0;

  const m = (model || '').toLowerCase();
  let inPerM = 1.0;
  let outPerM = 4.0;
  if (m.includes('opus')) {
    inPerM = 5.0;
    outPerM = 25.0;
  } else if (m.includes('sonnet') || m.includes('claude')) {
    inPerM = 2.0;
    outPerM = 10.0;
  } else if (m.includes('flash-lite')) {
    inPerM = 0.08;
    outPerM = 0.3;
  } else if (m.includes('flash')) {
    inPerM = 0.15;
    outPerM = 0.6;
  } else if (m.includes('gemini') || m.includes('argon') || m.includes('pro')) {
    inPerM = 1.25;
    outPerM = 5.0;
  } else if (m.includes('gpt')) {
    inPerM = 2.5;
    outPerM = 10.0;
  }

  return (tokensIn * inPerM + tokensOut * outPerM) / 1_000_000;
}

export function extractInsights(doc: ChatDocument): InsightsSummary {
  const decisions: DecisionItem[] = [];
  const actionItems: ActionItem[] = [];
  const fileSet = new Set<string>();
  const agentMap = new Map(doc.meta.agents.map((a) => [a.id.toLowerCase(), a]));
  const usageByAgent = new Map<string, AgentUsageStats>();
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let totalCostUsd =
    typeof doc.meta.spent_usd_archived === 'number' && doc.meta.spent_usd_archived > 0
      ? doc.meta.spent_usd_archived
      : 0;

  let dIdx = 1;
  let aIdx = 1;

  for (const msg of doc.messages) {
    const tIn = msg.meta?.tokens_in ?? 0;
    const tOut = msg.meta?.tokens_out ?? 0;
    totalTokensIn += tIn;
    totalTokensOut += tOut;

    const authorId = msg.author.toLowerCase();
    const cfg = agentMap.get(authorId);
    const msgCost = estimateCostUsd(
      msg.meta?.model ?? cfg?.model,
      msg.meta?.provider ?? cfg?.provider,
      tIn,
      tOut,
      msg.meta?.cost_usd
    );
    totalCostUsd += msgCost;

    if (authorId !== 'human' && authorId !== 'user') {
      const prev = usageByAgent.get(authorId) ?? {
        agentId: msg.author,
        turns: 0,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
      };
      prev.turns += 1;
      prev.tokensIn += tIn;
      prev.tokensOut += tOut;
      prev.costUsd += msgCost;
      usageByAgent.set(authorId, prev);
    }

    for (const f of msg.fileRefs) {
      fileSet.add(f);
    }

    if (msg.meta?.headingSuffix) {
      const suffix = msg.meta.headingSuffix;
      if (/\b(AGREED|DONE|FIXED)\b/i.test(suffix)) {
        decisions.push({
          id: `dec_${dIdx++}`,
          text: suffix.replace(/`/g, ''),
          author: msg.author,
          messageId: msg.id,
        });
      } else if (/\bOPEN\b/i.test(suffix)) {
        actionItems.push({
          id: `act_${aIdx++}`,
          done: false,
          text: suffix.replace(/`/g, ''),
          author: msg.author,
          messageId: msg.id,
        });
      }
    }

    const cleanBody = removeFencedCodeBlocks(msg.content);
    const lines = cleanBody.split('\n');

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Action items: - [ ] ... or - [x] ...
      const todoMatch = line.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/);
      if (todoMatch) {
        actionItems.push({
          id: `act_${aIdx++}`,
          done: todoMatch[1].toLowerCase() === 'x',
          text: todoMatch[2].trim(),
          author: msg.author,
          messageId: msg.id,
        });
        continue;
      }

      // Decisions: Decision: ..., Chốt: ..., ✅ ..., **[Decision]** ...
      const decisionMatch = line.match(
        /^(?:[-*]\s+)?(?:\*\*\[?(?:Decision|Quyết định|Chốt)\]?:?\*\*|(?:Decision|Quyết định|Chốt):|✅|✓)\s*(.+)$/i
      );
      if (decisionMatch) {
        decisions.push({
          id: `dec_${dIdx++}`,
          text: decisionMatch[1].trim(),
          author: msg.author,
          messageId: msg.id,
        });
      }
    }
  }

  return {
    decisions,
    actionItems,
    referencedFiles: Array.from(fileSet),
    totalTokensIn,
    totalTokensOut,
    totalCostUsd,
    agentUsage: Array.from(usageByAgent.values()),
  };
}
