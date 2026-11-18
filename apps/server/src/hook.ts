import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PresenceIngestPayload } from '@synapse/shared';

interface GenericHookInput {
  // Antigravity camelCase fields
  hookEventName?: string;
  workspacePaths?: string[];
  toolCall?: {
    name?: string;
    args?: Record<string, unknown>;
  };
  // Claude Code snake_case fields
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  notification_type?: string;
  message?: string;
  cwd?: string;
}

function readStdinWithTimeout(timeoutMs = 150): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }

    let data = '';
    const timer = setTimeout(() => {
      cleanup();
      resolve(data);
    }, timeoutMs);

    const onData = (chunk: Buffer | string) => {
      data += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    };
    const onEnd = () => {
      cleanup();
      resolve(data);
    };
    const cleanup = () => {
      clearTimeout(timer);
      process.stdin.off('data', onData);
      process.stdin.off('end', onEnd);
      process.stdin.off('error', onEnd);
    };

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', onData);
    process.stdin.on('end', onEnd);
    process.stdin.on('error', onEnd);
    process.stdin.resume();
  });
}

function pickString(obj: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!obj) return undefined;
  for (const k of keys) {
    const val = obj[k];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return undefined;
}

export function normalizeHookInput(agent: string, rawJson: string, fallbackEvent = 'working'): PresenceIngestPayload {
  let parsed: GenericHookInput = {};
  try {
    if (rawJson.trim()) {
      parsed = JSON.parse(rawJson) as GenericHookInput;
    }
  } catch {
    parsed = {};
  }

  const isAntigravity = Boolean(parsed.hookEventName || parsed.toolCall);
  const event = parsed.hookEventName || parsed.hook_event_name || fallbackEvent;
  const tool = parsed.toolCall?.name || parsed.tool_name;
  const args = parsed.toolCall?.args || parsed.tool_input;

  const targetPath = pickString(args, ['file_path', 'path', 'Path', 'TargetFile', 'DirectoryPath', 'AbsolutePath']);
  const command = pickString(args, ['command', 'CommandLine']);
  const workspaceRoot = parsed.workspacePaths?.[0] || parsed.cwd;

  let detail: string | undefined;
  if (event === 'Notification') {
    detail = parsed.message || (parsed.notification_type ? `Chờ phản hồi (${parsed.notification_type})` : 'Cần bạn duyệt');
  }

  return {
    agent,
    source: isAntigravity ? 'antigravity-hook' : 'claude-hook',
    event,
    tool,
    path: targetPath,
    command,
    detail,
    workspaceRoot,
  };
}

async function main(): Promise<void> {
  const agent = process.argv[2] || 'claude';
  const port = Number(process.argv[3] || process.env.SYNAPSE_PORT || 4321);
  const fallbackEvent = process.argv[4] || 'working';

  try {
    const raw = await readStdinWithTimeout(150);
    const payload = normalizeHookInput(agent, raw, fallbackEvent);

    await fetch(`http://127.0.0.1:${port}/api/presence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(300),
    }).catch(() => undefined);
  } catch {
    // Always non-blocking
  } finally {
    // Antigravity hooks expect valid JSON on stdout
    process.stdout.write('{}\n');
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  void main().finally(() => {
    process.exit(0);
  });
}
