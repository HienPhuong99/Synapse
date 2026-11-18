import yaml from 'js-yaml';
import type {
  ActionItem,
  AgentConfig,
  ChatDocument,
  ChatMessage,
  ChatSessionMeta,
  DecisionItem,
  InsightsSummary,
  MessageMeta,
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

const KNOWN_THREAD_AGENTS: Record<string, Partial<AgentConfig>> = {
  claude: {
    id: 'claude',
    name: 'Claude',
    role: 'Anthropic Claude',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    color: '#f59e0b',
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    role: 'Google Gemini',
    provider: 'gemini',
    model: 'gemini-2.5-pro',
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
  for (const m of messages) {
    const id = m.author.toLowerCase();
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

export function parseChatMd(raw: string, filePath = ''): ChatDocument {
  const { hasFrontmatter, meta, body } = parseFrontmatter(raw);
  const lines = body.split('\n');

  // Detect ZeroPort-style H3 thread chat.md when no YAML frontmatter is present
  const hasH2Msg = lines.some((l) => Boolean(parseMessageHeading(l, 1)));
  const hasH3ThreadMsg = !hasFrontmatter && !hasH2Msg && lines.some((l) => Boolean(parseThreadH3Heading(l, 1)));

  const preambleLines: string[] = [];
  const blocks: { heading: RawHeadingMatch; lines: string[] }[] = [];

  let currentBlock: { heading: RawHeadingMatch; lines: string[] } | null = null;
  let activeFence: { char: string; len: number } | null = null;

  for (const line of lines) {
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
      const heading = hasH3ThreadMsg
        ? line.startsWith('### ')
          ? parseThreadH3Heading(line, blocks.length + 1)
          : null
        : line.startsWith('## ')
          ? parseMessageHeading(line, blocks.length + 1)
          : null;

      if (heading) {
        if (currentBlock) {
          blocks.push(currentBlock);
        }
        currentBlock = { heading, lines: [] };
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
  const preamble = preambleLines.join('\n').trim();

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
  if (!ts) {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())} +07`;
  }
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(ts)) {
    return ts;
  }
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} +07`;
}

export function serializeChatMd(doc: ChatDocument): string {
  if (doc.meta.schema === 'thread-md/v1') {
    const parts: string[] = [];
    if (doc.preamble && doc.preamble.trim()) {
      parts.push(doc.preamble.trim());
    }

    for (const msg of doc.messages) {
      const authorLabel = formatAuthorLabel(msg.author);
      const targetId = msg.meta?.target || msg.mentions[0];
      const actorPart = targetId ? `${authorLabel} -> ${formatAuthorLabel(targetId)}` : authorLabel;
      const tsPart = formatThreadTimestamp(msg.timestamp);
      const suffixPart = msg.meta?.headingSuffix ? ` — ${msg.meta.headingSuffix}` : '';
      const heading = `### \`[${actorPart} | ${tsPart}]\`${suffixPart}`;

      const msgLines: string[] = [heading];
      if (msg.thinking && msg.thinking.trim()) {
        msgLines.push(
          `<details data-synapse="thinking">\n<summary>Quá trình suy nghĩ</summary>\n\n${msg.thinking.trim()}\n\n</details>`
        );
      }
      if (msg.content && msg.content.trim()) {
        msgLines.push(msg.content.trim());
      }
      parts.push(msgLines.join('\n\n'));
    }

    return parts.join('\n\n') + '\n';
  }

  const cleanMeta: Record<string, unknown> = {
    schema: doc.meta.schema || 'synapse/v1',
    title: doc.meta.title || 'Untitled Discussion',
    project_root: doc.meta.project_root || '.',
    mode: doc.meta.mode || 'mention_and_round_robin',
    max_turns: doc.meta.max_turns || 12,
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
    const tsPart = msg.timestamp ? ` · ${msg.timestamp}` : '';
    const msgLines: string[] = [`## [${msg.id}] @${msg.author}${tsPart}`];

    if (msg.meta && Object.keys(msg.meta).length > 0) {
      msgLines.push(`<!-- synapse: ${JSON.stringify(msg.meta)} -->`);
    }

    if (msg.thinking && msg.thinking.trim()) {
      msgLines.push(
        `<details data-synapse="thinking">\n<summary>Quá trình suy nghĩ</summary>\n\n${msg.thinking.trim()}\n\n</details>`
      );
    }

    if (msg.content && msg.content.trim()) {
      msgLines.push(msg.content.trim());
    }

    parts.push(msgLines.join('\n\n'));
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

export function extractInsights(doc: ChatDocument): InsightsSummary {
  const decisions: DecisionItem[] = [];
  const actionItems: ActionItem[] = [];
  const fileSet = new Set<string>();
  let totalTokensIn = 0;
  let totalTokensOut = 0;

  let dIdx = 1;
  let aIdx = 1;

  for (const msg of doc.messages) {
    if (msg.meta?.tokens_in) totalTokensIn += msg.meta.tokens_in;
    if (msg.meta?.tokens_out) totalTokensOut += msg.meta.tokens_out;
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
  };
}
