import { useEffect, useRef, useState } from 'react';
import {
  Columns2,
  Pause,
  Play,
  Send,
  Settings,
  SkipForward,
  Sparkles,
  X,
} from 'lucide-react';
import type { ChatMessage } from '@synapse/shared';
import { api } from '../lib/api.ts';
import { useSynapseStore } from '../store/useSynapseStore.ts';
import { MessageCard } from './MessageCard.tsx';
import { RawMarkdownPane } from './RawMarkdownPane.tsx';

interface ChatStageProps {
  onOpenSettings: () => void;
  onNewSession: () => void;
}

export function ChatStage({ onOpenSettings, onNewSession }: ChatStageProps) {
  const {
    activeDoc,
    streams,
    splitView,
    orchestratorRunning,
    turnCount,
    orchestratorNotice,
    errorBanner,
    composerText,
    setSplitView,
    setComposerText,
    appendComposerToken,
    selectSession,
    clearError,
  } = useSynapseStore();

  const [autoRunOnSend, setAutoRunOnSend] = useState(true);
  const [sending, setSending] = useState(false);
  const feedEndRef = useRef<HTMLDivElement | null>(null);

  const activeStream = activeDoc ? streams[activeDoc.filePath] : undefined;

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeDoc?.messages.length, activeStream?.content]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeDoc || !composerText.trim() || sending) return;
    setSending(true);
    try {
      const text = composerText;
      setComposerText('');
      await api.postMessage(activeDoc.filePath, text, autoRunOnSend);
    } finally {
      setSending(false);
    }
  };

  const handleEdit = async (messageId: string, content: string) => {
    if (!activeDoc) return;
    await api.editMessage(activeDoc.filePath, messageId, content);
  };

  const handleBranch = async (messageId: string) => {
    if (!activeDoc) return;
    const res = await api.branchFromMessage(activeDoc.filePath, messageId);
    await selectSession(res.document.filePath);
  };

  const handleRerun = async (messageId: string) => {
    if (!activeDoc) return;
    await api.rerunFromMessage(activeDoc.filePath, messageId);
  };

  if (!activeDoc) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center bg-zinc-950 px-6 text-center">
        <div className="max-w-md space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
            <Sparkles className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-100">Chào mừng đến với Synapse</h2>
          <p className="text-sm text-zinc-400">
            Chọn một file <code>.chat.md</code> bên trái để theo dõi các AI Agent trao đổi về dự án, hoặc tạo một
            phòng thảo luận mới.
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={onNewSession}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500"
            >
              Tạo phòng thảo luận
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
            >
              Cấu hình API / Ollama
            </button>
          </div>
        </div>
      </main>
    );
  }

  const agentsMap = new Map(activeDoc.meta.agents.map((a) => [a.id, a]));

  const streamingCardMsg: ChatMessage | null = activeStream
    ? {
        id: activeStream.messageId,
        author: activeStream.author,
        timestamp: activeStream.startedAt,
        thinking: activeStream.thinking || undefined,
        content: activeStream.content,
        meta: {
          id: activeStream.messageId,
          model: activeStream.model,
          provider: activeStream.provider,
          status: 'streaming',
        },
        mentions: [],
        fileRefs: [],
      }
    : null;

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-zinc-950">
      {/* Top Toolbar */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/90 bg-zinc-950/95 px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-zinc-100">{activeDoc.meta.title}</h2>
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
              {activeDoc.meta.mode}
            </span>
            {orchestratorRunning && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                <span className="h-1.5 w-1.5 animate-ping rounded-full bg-emerald-400" />
                Auto turn {turnCount}/{activeDoc.meta.max_turns}
              </span>
            )}
          </div>
          <p className="truncate font-mono text-[11px] text-zinc-500">{activeDoc.filePath}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {orchestratorRunning ? (
            <button
              type="button"
              onClick={() => void api.controlSession(activeDoc.filePath, 'pause')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-500"
            >
              <Pause className="h-3.5 w-3.5" />
              Tạm dừng
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void api.controlSession(activeDoc.filePath, 'start')}
                disabled={activeDoc.meta.agents.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
                title="Để các AI Agent tự trao đổi liên tiếp tối đa max_turns lượt"
              >
                <Play className="h-3.5 w-3.5" />
                Chạy tự động
              </button>
              <button
                type="button"
                onClick={() => void api.controlSession(activeDoc.filePath, 'step')}
                disabled={activeDoc.meta.agents.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
                title="Chạy tiếp đúng 1 lượt AI"
              >
                <SkipForward className="h-3.5 w-3.5" />
                1 lượt
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setSplitView(!splitView)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
              splitView
                ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-300'
                : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
            }`}
            title="Xem & sửa song song file raw .chat.md"
          >
            <Columns2 className="h-3.5 w-3.5" />
            Split .chat.md
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="rounded-lg border border-zinc-700 bg-zinc-900 p-1.5 text-zinc-300 hover:bg-zinc-800"
            title="Cài đặt API Keys & Ollama"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Banners */}
      {(errorBanner || orchestratorNotice) && (
        <div
          className={`flex items-center justify-between border-b px-4 py-2 text-xs ${
            errorBanner
              ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
              : 'border-indigo-500/30 bg-indigo-500/10 text-indigo-200'
          }`}
        >
          <span>{errorBanner || orchestratorNotice}</span>
          <button type="button" onClick={clearError} className="rounded p-0.5 hover:bg-white/10">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Body: Chat Feed + Optional Raw Markdown Split View */}
      <div className="flex min-h-0 flex-1">
        <div className={`flex min-w-0 flex-col ${splitView ? 'w-1/2' : 'w-full'}`}>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {activeDoc.messages.length === 0 && !streamingCardMsg && (
              <div className="rounded-xl border border-dashed border-zinc-800 p-8 text-center text-xs text-zinc-500">
                Phòng thảo luận chưa có tin nhắn nào. Hãy gửi đề bài bên dưới hoặc nhấn <b>Chạy tự động</b>.
              </div>
            )}

            {activeDoc.messages.map((msg) => (
              <MessageCard
                key={msg.id}
                message={msg}
                agent={agentsMap.get(msg.author)}
                onEdit={handleEdit}
                onBranch={handleBranch}
                onRerun={handleRerun}
              />
            ))}

            {streamingCardMsg && (
              <MessageCard
                message={streamingCardMsg}
                agent={agentsMap.get(streamingCardMsg.author)}
                isStreaming
              />
            )}
            <div ref={feedEndRef} />
          </div>

          {/* Composer */}
          <form onSubmit={(e) => void handleSend(e)} className="border-t border-zinc-800/90 bg-zinc-950 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-zinc-500">Tag nhanh:</span>
                {activeDoc.meta.agents.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => appendComposerToken(`@${a.id}`)}
                    className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-[11px] text-zinc-300 hover:border-indigo-500/50 hover:text-indigo-300"
                  >
                    @{a.id}
                  </button>
                ))}
              </div>
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-zinc-400">
                <input
                  type="checkbox"
                  checked={autoRunOnSend}
                  onChange={(e) => setAutoRunOnSend(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-900 text-indigo-500"
                />
                Tự chạy AI sau khi gửi
              </label>
            </div>

            <div className="flex gap-2">
              <textarea
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                rows={2}
                placeholder="Nhập ý kiến can thiệp, @agent để chỉ định hoặc @file:path để đính kèm code (Ctrl+Enter để gửi)..."
                className="flex-1 resize-none rounded-xl border border-zinc-800 bg-zinc-900/90 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!composerText.trim() || sending}
                className="inline-flex items-center gap-1.5 self-end rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" />
                Gửi
              </button>
            </div>
          </form>
        </div>

        {splitView && <RawMarkdownPane />}
      </div>
    </main>
  );
}
