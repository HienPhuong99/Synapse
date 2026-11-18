import { buildConversationTranscript, buildSystemPrompt } from './openaiCompat.js';
import type { ProviderPromptContext, ProviderStreamCallbacks, ProviderStreamResult } from './types.js';

export async function runGeminiProvider(
  ctx: ProviderPromptContext,
  callbacks: ProviderStreamCallbacks
): Promise<ProviderStreamResult> {
  const apiKey = ctx.settings.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Thiếu Gemini API Key. Hãy cấu hình trong Settings hoặc biến môi trường GEMINI_API_KEY.');
  }

  const model = encodeURIComponent(ctx.agent.model || 'gemini-2.5-flash');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: ctx.signal,
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: buildSystemPrompt(ctx) }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: buildConversationTranscript(ctx.document, ctx.agent.id) }],
        },
      ],
    }),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Gemini error (${res.status}): ${errText}`);
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
          candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
        };
        const parts = parsed.candidates?.[0]?.content?.parts ?? [];
        for (const p of parts) {
          if (!p.text) continue;
          if (p.thought) {
            thinking += p.text;
            callbacks.onThinkingDelta(p.text);
          } else {
            content += p.text;
            callbacks.onContentDelta(p.text);
          }
        }
        if (parsed.usageMetadata) {
          tokensIn = parsed.usageMetadata.promptTokenCount;
          tokensOut = parsed.usageMetadata.candidatesTokenCount;
        }
      } catch {
        // Ignore partial JSON lines
      }
    }
  }

  return { thinking, content, tokensIn, tokensOut };
}
