import { spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { buildConversationTranscript, buildSystemPrompt } from './openaiCompat.js';
import type { CliActivity, ProviderPromptContext, ProviderStreamCallbacks, ProviderStreamResult } from './types.js';

type CliKind = 'claude' | 'gemini';

// ponytail: in-memory per (workspace, file, agent); lost on restart, the transcript re-supplies context.
const claudeSessions = new Map<string, string>();

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
    `Câu trả lời cuối cùng của bạn sẽ được Synapse TỰ ghi vào "${document.filePath}". KHÔNG tự sửa file đó.`,
    buildConversationTranscript({ ...document, messages }, agent.id),
  ].join('\n\n');
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
        ['-p', '', '-o', 'stream-json', '--approval-mode', 'auto_edit', ...(model ? ['-m', model] : [])];

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
      if (ev.type === 'system' && ev.subtype === 'init' && ev.session_id) claudeSessions.set(sessionKey, ev.session_id);
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
        if (ev.session_id) claudeSessions.set(sessionKey, ev.session_id);
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
