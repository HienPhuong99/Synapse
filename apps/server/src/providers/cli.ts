import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { buildConversationTranscript, buildSystemPrompt } from './openaiCompat.js';
import type { CliActivity, ProviderPromptContext, ProviderStreamCallbacks, ProviderStreamResult } from './types.js';

type CliKind = 'claude' | 'gemini';

// Per (workspace, file, agent), saved next to settings so a server restart can still --resume.
const SESSIONS_PATH = process.env.SYNAPSE_SESSIONS_FILE || path.join(os.homedir(), '.synapse', 'claude-sessions.json');
const claudeSessions = new Map<string, string>(
  Object.entries((() => {
    try {
      return JSON.parse(fs.readFileSync(SESSIONS_PATH, 'utf8')) as Record<string, string>;
    } catch {
      return {};
    }
  })())
);
function saveSession(key: string, id: string | undefined): void {
  if (id ? claudeSessions.get(key) === id : !claudeSessions.has(key)) return;
  if (id) claudeSessions.set(key, id);
  else claudeSessions.delete(key);
  fs.promises
    .mkdir(path.dirname(SESSIONS_PATH), { recursive: true })
    .then(() => fs.promises.writeFile(SESSIONS_PATH, JSON.stringify(Object.fromEntries(claudeSessions), null, 2)))
    .catch(() => undefined); // best effort: worst case the next turn starts a fresh session
}

// Headless permissions: edits auto-approved, shell limited to build/test/git-read. Anything else is
// denied and reported back in the message, so the human can widen it deliberately.
const CLAUDE_ALLOWED_TOOLS = ['Bash(npm test*)', 'Bash(npm run *)', 'Bash(git status*)', 'Bash(git diff*)', 'Bash(git log*)'];

/** Model names that mean "use the CLI's own default". */
const DEFAULT_MODELS = new Set(['', 'default', 'synapse-sim-1', 'external-agent']);

export function buildCliPrompt(ctx: ProviderPromptContext, resumed: boolean): string {
  const { agent, document } = ctx;
  // When resuming, the CLI already remembers the earlier turns: send only what is new to this agent.
  let messages = document.messages;
  if (resumed) {
    const lastOwn = messages.map((m) => m.author).lastIndexOf(agent.id);
    if (lastOwn >= 0) messages = messages.slice(lastOwn + 1);
  }
  return [
    buildSystemPrompt({ ...ctx, fileExcerpts: [] }), // the CLI reads files itself
    `Bạn đang được Synapse gọi ở chế độ headless, ngay trong thư mục dự án: được đọc/sửa code và chạy lệnh build/test.`,
    agent.worktree
      ? `Bạn đang chạy trong Git worktree riêng (${ctx.cwd}); sau lượt này Synapse sẽ tự commit thay đổi code vào branch riêng. KHÔNG sửa chat.md / *.chat.md trong worktree; hãy dùng MCP post_message (nếu có) hoặc trả lời trực tiếp để Synapse ghi lại.`
      : '',
    `Câu trả lời cuối cùng của bạn sẽ được Synapse TỰ ghi vào "${document.filePath}". KHÔNG tự sửa file đó.`,
    buildConversationTranscript({ ...document, messages }, agent.id),
  ]
    .filter(Boolean)
    .join('\n\n');
}

function quoteForCmd(arg: string): string {
  if (!/^[\w./:=*() ,-]*$/.test(arg)) throw new Error(`Tham số CLI không an toàn: ${arg}`);
  return `"${arg}"`;
}

function summarizeTool(name: string, input: Record<string, unknown> = {}): CliActivity {
  const path = (input.file_path ?? input.path ?? input.absolute_path) as string | undefined;
  const command = input.command as string | undefined;
  const detail = command ?? path ?? (input.pattern as string | undefined) ?? (input.query as string | undefined);
  return { tool: name, path, command, detail };
}

export async function runCliProvider(
  ctx: ProviderPromptContext,
  callbacks: ProviderStreamCallbacks,
  kind: CliKind
): Promise<ProviderStreamResult> {
  const { agent, cwd, signal, settings } = ctx;
  const sessionKey = `${cwd}|${ctx.document.filePath}|${agent.id}`;
  const resumeId = kind === 'claude' ? claudeSessions.get(sessionKey) : undefined;
  const model = DEFAULT_MODELS.has(agent.model) ? undefined : agent.model;

  const args =
    kind === 'claude'
      ? [
          '-p',
          '--output-format', 'stream-json',
          '--verbose',
          '--permission-mode', 'acceptEdits',
          '--allowedTools', ...CLAUDE_ALLOWED_TOOLS,
          ...(model ? ['--model', model] : []),
          ...(resumeId ? ['--resume', resumeId] : []),
        ]
      : // ponytail: no --resume for Gemini (it takes "latest"/index, which could grab the user's own session).
        ['-p', '', '-o', 'stream-json', '--approval-mode', 'auto_edit', '--skip-trust', ...(model ? ['-m', model] : [])];

  const env = { ...process.env };
  if (kind === 'gemini' && settings.geminiApiKey) env.GEMINI_API_KEY = settings.geminiApiKey;

  const isWin = process.platform === 'win32';
  // npm installs the CLIs as .cmd shims on Windows, which need a shell; args are pre-quoted for cmd.exe.
  const opts = { cwd, env, windowsHide: true };
  const child = isWin
    ? spawn([kind, ...args.map(quoteForCmd)].join(' '), { ...opts, shell: true })
    : spawn(kind, args, opts);

  const kill = () => {
    if (child.exitCode !== null || !child.pid) return;
    if (isWin) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    else child.kill('SIGTERM');
  };
  if (signal.aborted) kill();
  signal.addEventListener('abort', kill, { once: true });

  child.stdin.end(buildCliPrompt(ctx, Boolean(resumeId)));

  let stderrTail = '';
  child.stderr.on('data', (d: Buffer) => {
    stderrTail = (stderrTail + d.toString('utf8')).slice(-2000);
  });

  let thinking = '';
  let pending = ''; // latest assistant text; becomes the reply unless more work follows it
  let finalText: string | undefined;
  let tokensIn: number | undefined;
  let tokensOut: number | undefined;
  let costUsd: number | undefined;
  let failure: string | undefined;
  const notes: string[] = [];

  const log = (text: string) => {
    thinking += text;
    callbacks.onThinkingDelta(text);
  };
  const flushPending = () => {
    if (pending.trim()) log(`${pending.trim()}\n\n`);
    pending = '';
  };
  const rel = (p?: string) => (p && path.isAbsolute(p) ? path.relative(cwd, p).replace(/\\/g, '/') : p);
  const activity = (raw: CliActivity) => {
    const a = { ...raw, path: rel(raw.path), detail: raw.detail === raw.path ? rel(raw.path) : raw.detail };
    flushPending();
    log(`→ ${a.tool}${a.detail ? ` \`${a.detail.replace(/\s+/g, ' ').slice(0, 120)}\`` : ''}\n`);
    callbacks.onActivity?.(a);
  };

  const handle = (ev: Record<string, any>) => {
    if (kind === 'claude') {
      if (ev.type === 'system' && ev.subtype === 'init' && ev.session_id) saveSession(sessionKey, ev.session_id);
      if (ev.type === 'assistant') {
        for (const block of ev.message?.content ?? []) {
          if (block.type === 'text' && block.text) {
            flushPending();
            pending = block.text;
          } else if (block.type === 'thinking' && block.thinking) {
            log(`${block.thinking}\n\n`);
          } else if (block.type === 'tool_use') {
            activity(summarizeTool(block.name, block.input));
          }
        }
      }
      if (ev.type === 'result') {
        if (ev.session_id) saveSession(sessionKey, ev.session_id);
        finalText = typeof ev.result === 'string' ? ev.result : undefined;
        tokensIn = ev.usage ? (ev.usage.input_tokens ?? 0) + (ev.usage.cache_read_input_tokens ?? 0) + (ev.usage.cache_creation_input_tokens ?? 0) : undefined;
        tokensOut = ev.usage?.output_tokens;
        if (typeof ev.total_cost_usd === 'number') costUsd = ev.total_cost_usd;
        for (const d of ev.permission_denials ?? []) {
          const s = summarizeTool(d.tool_name, d.tool_input);
          notes.push(`${s.tool}${s.detail ? ` \`${s.detail}\`` : ''}`);
        }
        if (ev.is_error) failure = finalText || ev.subtype || 'Claude Code báo lỗi';
      }
    } else {
      if (ev.type === 'message' && ev.role === 'assistant' && typeof ev.content === 'string') {
        pending += ev.content;
      } else if (ev.type === 'tool_use') {
        activity(summarizeTool(ev.tool_name ?? ev.name ?? 'tool', ev.parameters ?? ev.input));
      } else if (ev.type === 'error') {
        notes.push(String(ev.message ?? ev.error ?? 'lỗi'));
      } else if (ev.type === 'result') {
        const stats = ev.stats ?? {};
        tokensIn = stats.input_tokens ?? stats.input;
        tokensOut = stats.output_tokens ?? stats.output;
        if (ev.status === 'error') failure = String(ev.error?.message ?? ev.error ?? 'Gemini CLI báo lỗi');
      }
    }
  };

  const lines = readline.createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    if (!line.startsWith('{')) return;
    try {
      handle(JSON.parse(line));
    } catch {
      // not an event line
    }
  });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  signal.removeEventListener('abort', kill);

  if (signal.aborted) {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    throw err;
  }
  // A saved session can expire or be deleted; drop it so the next turn starts fresh instead of failing forever.
  if (resumeId && (failure || exitCode !== 0)) saveSession(sessionKey, undefined);
  if (failure) throw new Error(failure);

  let content = (finalText ?? pending).trim();
  if (!content && exitCode !== 0) {
    throw new Error(`${kind} thoát mã ${exitCode}: ${stderrTail.trim() || 'không có output'}`);
  }
  if (notes.length > 0) {
    content += `\n\n> Synapse: bị chặn quyền/lỗi khi chạy headless: ${notes.join(', ')}. Chạy tay trong CLI nếu cần.`;
  }
  callbacks.onContentDelta(content);
  return { thinking, content, tokensIn, tokensOut, costUsd };
}
