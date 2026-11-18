import { buildConversationTranscript, buildSystemPrompt } from './openaiCompat.js';
import type { ProviderPromptContext, ProviderStreamCallbacks, ProviderStreamResult } from './types.js';

export async function runAnthropicProvider(
  ctx: ProviderPromptContext,
  callbacks: ProviderStreamCallbacks
): Promise<ProviderStreamResult> {
  const apiKey = ctx.settings.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Thiếu Anthropic API Key. Hãy cấu hình trong Settings hoặc biến môi trường ANTHROPIC_API_KEY.');
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    signal: ctx.signal,
    body: JSON.stringify({
      model: ctx.agent.model || 'claude-sonnet-4-5',
      max_tokens: 2048,
      stream: true,
      system: buildSystemPrompt(ctx),
      messages: [
        {
          role: 'user',
          content: buildConversationTranscript(ctx.document, ctx.agent.id),
        },
      ],
    }),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Anthropic error (${res.status}): ${errText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let thinking = '';
  let tokensIn: number | undefined;
  let tokensOut: number | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data) continue;

      try {
        const parsed = JSON.parse(data) as {
          type?: string;
          delta?: { type?: string; text?: string; thinking?: string };
          message?: { usage?: { input_tokens?: number } };
          usage?: { output_tokens?: number };
        };
        if (parsed.type === 'message_start' && parsed.message?.usage?.input_tokens) {
          tokensIn = parsed.message.usage.input_tokens;
        } else if (parsed.type === 'content_block_delta') {
          if (parsed.delta?.type === 'thinking_delta' && parsed.delta.thinking) {
            thinking += parsed.delta.thinking;
            callbacks.onThinkingDelta(parsed.delta.thinking);
          } else if (parsed.delta?.type === 'text_delta' && parsed.delta.text) {
            content += parsed.delta.text;
            callbacks.onContentDelta(parsed.delta.text);
          }
        } else if (parsed.type === 'message_delta' && parsed.usage?.output_tokens) {
          tokensOut = parsed.usage.output_tokens;
        }
      } catch {
        // Ignore partial JSON lines
      }
    }
  }

  return { thinking, content, tokensIn, tokensOut };
}
