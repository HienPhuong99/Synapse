import type { ProviderPromptContext, ProviderStreamCallbacks, ProviderStreamResult } from './types.js';

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function streamWords(
  text: string,
  onDelta: (delta: string) => void,
  signal: AbortSignal,
  delayMs = 22
): Promise<void> {
  const chunks = text.match(/(\S+\s*|\n+)/g) ?? [text];
  for (const chunk of chunks) {
    await sleep(delayMs, signal);
    onDelta(chunk);
  }
}

export async function runSimulatorProvider(
  ctx: ProviderPromptContext,
  callbacks: ProviderStreamCallbacks
): Promise<ProviderStreamResult> {
  const { agent, document, fileExcerpts, signal } = ctx;
  const lastMsg = document.messages[document.messages.length - 1];
  const otherAgents = document.meta.agents.filter((a) => a.id !== agent.id);
  const nextAgent = otherAgents[0];

  const excerptNote =
    fileExcerpts.length > 0
      ? `Đã đọc ${fileExcerpts.length} file ngữ cảnh (${fileExcerpts.map((f) => `\`${f.path}\``).join(', ')}).`
      : 'Đang phân tích dựa trên luồng trao đổi hiện tại của phòng.';

  const thinkingText = [
    `Vai trò: ${agent.role || agent.name} (${agent.model}).`,
    excerptNote,
    lastMsg
      ? `Phản hồi tin nhắn mới nhất của @${lastMsg.author}: "${lastMsg.content.slice(0, 90).replace(/\s+/g, ' ')}..."`
      : `Khởi tạo phân tích cho chủ đề "${document.meta.title}".`,
  ].join('\n');

  const roleKey = `${agent.id} ${agent.role || ''}`.toLowerCase();
  let responseLines: string[] = [];

  if (roleKey.includes('review') || roleKey.includes('qa') || roleKey.includes('sec')) {
    responseLines = [
      `Tôi đã rà soát đề xuất vừa rồi dưới góc độ **${agent.role || 'Reviewer'}**:`,
      '',
      '1. **Edge-case cần chặn sớm:** Đảm bảo cơ chế retry khi lock file có backoff và giới hạn số lần thử để không treo queue.',
      '2. **Bảo toàn dữ liệu:** Luôn kiểm tra hash/mtime trước khi append nhằm tránh ghi đè sửa đổi từ editor bên ngoài.',
      '',
      'Chốt: Bổ sung test integration cho tình huống concurrent write và malformed frontmatter.',
      '- [ ] Kiểm tra edge-case atomic rename trên Windows',
      nextAgent ? `\n@${nextAgent.id} bạn thấy phương án xử lý này ổn để triển khai chưa?` : '',
    ];
  } else if (roleKey.includes('front') || roleKey.includes('ui') || roleKey.includes('design')) {
    responseLines = [
      `Dưới góc độ **${agent.role || 'Frontend UI'}**, tôi đề xuất cách hiển thị trực quan cho luồng này:`,
      '',
      '- Tin nhắn đang stream dùng state tạm (**ephemeral draft**) để UI mượt 60fps mà không spam sự kiện ghi file.',
      '- Khi người dùng bật **Split View**, giữ scroll đồng bộ giữa Markdown render và raw `.chat.md`.',
      '',
      'Chốt: Tách store streaming tách biệt khỏi document đã lưu trên đĩa.',
      '- [ ] Thêm nút Branch & Edit trực tiếp trên từng MessageCard',
      nextAgent ? `\n@${nextAgent.id} phần payload WebSocket hiện tại đã đủ thông tin chưa?` : '',
    ];
  } else {
    responseLines = [
      `Góc nhìn từ **${agent.role || agent.name}** về chủ đề **${document.meta.title}**:`,
      '',
      '- Giữ file `.chat.md` làm **Single Source of Truth** giúp dễ review diff và commit chung với mã nguồn.',
      '- Phân tách rõ **Observer Watcher** (nhận thay đổi ngoài) và **Turn Orchestrator** (điều phối model) qua một `WriteQueue` dùng chung.',
      '',
      'Chốt: Sử dụng kiến trúc Event-driven qua WebSocket kết hợp WriteQueue theo từng file.',
      '- [ ] Chuẩn hóa metadata comment `<!-- synapse: {...} -->` cho token & model tracking',
      nextAgent ? `\nNhờ @${nextAgent.id} phản biện thêm các rủi ro tiềm ẩn của hướng này.` : '',
    ];
  }

  const contentText = responseLines.filter((l) => l !== undefined).join('\n').trim();

  await streamWords(thinkingText, callbacks.onThinkingDelta, signal, 14);
  await sleep(140, signal);
  await streamWords(contentText, callbacks.onContentDelta, signal, 22);

  return {
    thinking: thinkingText,
    content: contentText,
    tokensIn: Math.max(80, Math.round((lastMsg?.content.length ?? 120) / 3)),
    tokensOut: Math.max(60, Math.round((thinkingText.length + contentText.length) / 4)),
  };
}
