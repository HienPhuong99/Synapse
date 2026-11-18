import type { ChatDocument } from '@synapse/shared';
import type { ProviderPromptContext, ProviderStreamCallbacks, ProviderStreamResult } from './types.js';

export function buildSystemPrompt(ctx: ProviderPromptContext): string {
  const { agent, document, fileExcerpts } = ctx;
  const peers = document.meta.agents
    .filter((a) => a.id !== agent.id)
    .map((a) => `@${a.id} (${a.role || a.name})`)
    .join(', ');

  const parts = [
    `Bạn là AI Agent @${agent.id} (${agent.name}${agent.role ? ` - ${agent.role}` : ''}) đang tham gia thảo luận nhóm về dự án trong file "${document.filePath}".`,
    `Chủ đề phiên thảo luận: ${document.meta.title}`,
    peers ? `Các thành viên AI khác trong phòng: ${peers}.` : '',
    agent.system_prompt ? `Hướng dẫn vai trò của bạn: ${agent.system_prompt}` : '',
    `Quy tắc giao tiếp:`,
    `- Trả lời súc tích, thực tế, đi thẳng vào giải pháp kỹ thuật.`,
    `- Dùng "@<agent_id>" khi muốn mời một agent cụ thể phản hồi tiếp.`,
    `- Khi có quyết định kỹ thuật đã thống nhất, viết một dòng bắt đầu bằng "Chốt: ...".`,
    `- Khi có đầu việc cần làm, dùng checkbox Markdown "- [ ] ...".`,
  ];

  if (fileExcerpts.length > 0) {
    parts.push('Ngữ cảnh mã nguồn được tham chiếu:');
    for (const f of fileExcerpts) {
      parts.push(`--- ${f.path} ---\n${f.content}`);
    }
  }

  return parts.filter(Boolean).join('\n\n');
}

export function buildConversationTranscript(doc: ChatDocument, currentAgentId: string): string {
  const recent = doc.messages.slice(-18);
  if (recent.length === 0) {
    return `Chủ đề: ${doc.meta.title}\nHãy mở đầu cuộc thảo luận với tư cách @${currentAgentId}.`;
  }
  const lines = recent.map((m) => `[@${m.author}${m.timestamp ? ` · ${m.timestamp}` : ''}]:\n${m.content}`);
  return `${lines.join('\n\n---\n\n')}\n\n---\nHãy trả lời tiếp với tư cách @${currentAgentId}.`;
}

export async function runOpenAICompatProvider(
  ctx: ProviderPromptContext,
  callbacks: ProviderStreamCallbacks,
  mode: 'openai' | 'ollama'
): Promise<ProviderStreamResult> {
  const { agent, settings, signal } = ctx;
  let url = '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (mode === 'ollama') {
    const base = (settings.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    url = `${base}/v1/chat/completions`;
  } else {
    const apiKey = settings.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('Thiếu OpenAI API Key. Hãy cấu hình trong Settings hoặc biến môi trường OPENAI_API_KEY.');
    }
    const base = (settings.openaiBaseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
    url = `${base}/chat/completions`;
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      model: agent.model,
      stream: true,
      messages: [
        { role: 'system', content: buildSystemPrompt(ctx) },
        { role: 'user', content: buildConversationTranscript(ctx.document, agent.id) },
      ],
    }),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`${mode.toUpperCase()} error (${res.status}): ${errText}`);
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
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data) as {
          choices?: { delta?: { content?: string; reasoning_content?: string } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const delta = parsed.choices?.[0]?.delta;
        if (delta?.reasoning_content) {
          thinking += delta.reasoning_content;
          callbacks.onThinkingDelta(delta.reasoning_content);
        }
        if (delta?.content) {
          content += delta.content;
          callbacks.onContentDelta(delta.content);
        }
        if (parsed.usage) {
          tokensIn = parsed.usage.prompt_tokens;
          tokensOut = parsed.usage.completion_tokens;
        }
      } catch {
        // Ignore partial JSON lines
      }
    }
  }

  return { thinking, content, tokensIn, tokensOut };
}
