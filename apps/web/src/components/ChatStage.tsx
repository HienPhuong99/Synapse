import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Columns2,
  GitCompare,
  Pause,
  Play,
  Send,
  Settings,
  SkipForward,
  TerminalSquare,
  Users,
  X,
} from 'lucide-react';
import type { ChatMessage } from '@synapse/shared';
import { api } from '../lib/api.ts';
import { formatPresenceLabel, presenceDotColor } from '../lib/presence.ts';
import { useSynapseStore } from '../store/useSynapseStore.ts';
import { MessageCard } from './MessageCard.tsx';
import { RawMarkdownPane } from './RawMarkdownPane.tsx';

interface ChatStageProps {
  onOpenSettings: () => void;
  onNewSession: () => void;
  onOpenDiff: () => void;
}

export function ChatStage({ onOpenSettings, onNewSession, onOpenDiff }: ChatStageProps) {
  const {
    activeDoc,
    streams,
    presences,
    presenceAlert,
    latestNotification,
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
    clearPresenceAlert,
    clearNotification,
  } = useSynapseStore();

  const [autoRunOnSend, setAutoRunOnSend] = useState(true);
  const [sending, setSending] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const feedEndRef = useRef<HTMLDivElement | null>(null);

  const presenceList = Object.values(presences);
  const needsApprovalList = presenceList.filter((p) => p.status === 'needs_approval');
  const activeExternalList = presenceList.filter(
    (p) => p.status === 'working' || p.status === 'thinking' || p.status === 'typing' || p.status === 'needs_approval'
  );

  useEffect(() => {
    if (activeExternalList.length === 0) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeExternalList.length]);

  useEffect(() => {
    if (needsApprovalList.length > 0 || presenceAlert) {
      document.title = `[Cần duyệt] Synapse`;
    } else {
      document.title = 'Synapse — Project Thread Observer';
    }
  }, [needsApprovalList.length, presenceAlert]);

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
      <main className="flex flex-1 flex-col items-center justify-center bg-[#141415] px-6 text-center">
        <div className="max-w-md space-y-4 rounded-xl border border-[rgba(237,237,237,0.08)] bg-[#19191b] p-8">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-[rgba(237,237,237,0.1)] bg-[#232325] text-[#a1a1a6]">
            <TerminalSquare className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <h2 className="text-base font-medium text-[#ededed]">Chưa chọn phiên thảo luận</h2>
          <p className="text-[13px] leading-relaxed text-[#a1a1a6]">
            Chọn file <code>chat.md</code> hoặc <code>.chat.md</code> ở cột trái để theo dõi luồng trao đổi, hoặc
            tạo phòng thảo luận mới.
          </p>
          <div className="flex justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={onNewSession}
              className="h-9 rounded-lg bg-[#ededed] px-4 text-xs font-medium text-[#141415] transition-colors duration-150 hover:bg-white active:scale-[0.98]"
            >
              Tạo phòng mới
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              className="h-9 rounded-lg border border-[rgba(237,237,237,0.1)] bg-[#232325] px-4 text-xs font-medium text-[#ededed] transition-colors duration-150 hover:bg-[#2a2a2d]"
            >
              Cài đặt API / Ollama
            </button>
          </div>
        </div>
      </main>
    );
  }

  const agentsMap = new Map(activeDoc.meta.agents.map((a) => [a.id, a]));
  const lastDocMsg = activeDoc.messages[activeDoc.messages.length - 1];
  const isReadyForReview = Boolean(
    lastDocMsg && /READY FOR REVIEW/i.test(`${lastDocMsg.meta?.headingSuffix || ''} ${lastDocMsg.content}`)
  );

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
    <main className="flex min-w-0 flex-1 flex-col bg-[#141415]">
      {/* Top Bar */}
      <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-[rgba(237,237,237,0.08)] bg-[#141415] px-5 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h2 className="truncate text-[14px] font-medium text-[#ededed]">{activeDoc.meta.title}</h2>
            <span className="rounded bg-[#232325] px-1.5 py-0.5 font-mono text-xs text-[#a1a1a6]">
              {activeDoc.meta.mode}
            </span>
            {orchestratorRunning && (
              <span className="inline-flex items-center gap-1.5 font-mono text-xs text-[#4cc38a] tabular-nums">
                <span className="h-1.5 w-1.5 rounded-full bg-[#4cc38a]" />
                {turnCount}/{activeDoc.meta.max_turns}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate font-mono text-xs text-[#85858b]">{activeDoc.filePath}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {orchestratorRunning ? (
            <button
              type="button"
              onClick={() => void api.controlSession(activeDoc.filePath, 'pause')}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#e5484d] px-3 text-xs font-medium text-white transition-colors duration-150 hover:bg-[#d63f44] active:scale-[0.98]"
            >
              <Pause className="h-3.5 w-3.5" strokeWidth={1.75} />
              Tạm dừng
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void api.controlSession(activeDoc.filePath, 'start')}
                disabled={activeDoc.meta.agents.length === 0}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#ededed] px-3 text-xs font-medium text-[#141415] transition-colors duration-150 hover:bg-white active:scale-[0.98] disabled:opacity-40"
                title="Để các AI Agent tự trao đổi liên tiếp tối đa max_turns lượt"
              >
                <Play className="h-3.5 w-3.5" strokeWidth={1.75} />
                Chạy tự động
              </button>
              <button
                type="button"
                onClick={() => void api.controlSession(activeDoc.filePath, 'step')}
                disabled={activeDoc.meta.agents.length === 0}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[rgba(237,237,237,0.1)] bg-[#232325] px-3 text-xs font-medium text-[#ededed] transition-colors duration-150 hover:bg-[#2a2a2d] disabled:opacity-40"
                title="Chạy tiếp 1 lượt AI"
              >
                <SkipForward className="h-3.5 w-3.5 text-[#a1a1a6]" strokeWidth={1.5} />
                1 lượt
              </button>
              <button
                type="button"
                onClick={() => void api.controlSession(activeDoc.filePath, 'council')}
                disabled={activeDoc.meta.agents.length < 2}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[rgba(237,237,237,0.1)] bg-[#232325] px-3 text-xs font-medium text-[#ededed] transition-colors duration-150 hover:bg-[#2a2a2d] disabled:opacity-40"
                title="Hội đồng: các agent trả lời song song, chấm chéo ẩn danh và chủ tọa tổng hợp"
              >
                <Users className="h-3.5 w-3.5 text-[#a1a1a6]" strokeWidth={1.5} />
                Hội đồng
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onOpenDiff}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors duration-150 ${
              isReadyForReview
                ? 'border-[#4cc38a]/40 bg-[#4cc38a]/10 text-[#ededed]'
                : 'border-[rgba(237,237,237,0.08)] bg-[#19191b] text-[#a1a1a6] hover:bg-[#232325] hover:text-[#ededed]'
            }`}
            title="Xem git diff và gửi cho Reviewer"
          >
            <GitCompare className="h-3.5 w-3.5" strokeWidth={1.5} />
            {isReadyForReview && <span className="h-1.5 w-1.5 rounded-full bg-[#4cc38a]" />}
            Review diff
          </button>

          <button
            type="button"
            onClick={() => setSplitView(!splitView)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors duration-150 ${
              splitView
                ? 'border-[rgba(237,237,237,0.2)] bg-[#232325] text-[#ededed]'
                : 'border-[rgba(237,237,237,0.08)] bg-[#19191b] text-[#a1a1a6] hover:bg-[#232325] hover:text-[#ededed]'
            }`}
            title="Xem và sửa song song file raw Markdown"
          >
            <Columns2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            Split .chat.md
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[rgba(237,237,237,0.08)] bg-[#19191b] text-[#a1a1a6] transition-colors duration-150 hover:bg-[#232325] hover:text-[#ededed]"
            title="Cài đặt API Keys & Ollama"
            aria-label="Cài đặt"
          >
            <Settings className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      </header>

      {/* Live Presence Strip */}
      {presenceList.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-b border-[rgba(237,237,237,0.08)] bg-[#0f0f10] px-5 py-1.5 font-mono text-xs text-[#a1a1a6] tabular-nums">
          {presenceList.map((p) => (
            <span key={p.agentId} className="inline-flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: presenceDotColor(p.status) }}
              />
              <span className="text-[#ededed]">{p.agentId}</span>
              <span className="text-[#85858b]">· {formatPresenceLabel(p, nowMs)}</span>
            </span>
          ))}
        </div>
      )}

      {/* Needs Approval Alert Banner */}
      {(presenceAlert || needsApprovalList.length > 0) && (
        <div className="flex items-center justify-between border-b border-[#e5a04d]/30 bg-[#e5a04d]/10 px-5 py-2 text-xs text-[#f2cb96]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-[#e5a04d]" strokeWidth={1.5} />
            <span>
              {presenceAlert?.body ||
                `${needsApprovalList.map((p) => `${p.agentId}: ${p.detail || 'Cần bạn duyệt'}`).join(' · ')}`}
            </span>
          </div>
          {presenceAlert && (
            <button
              type="button"
              onClick={clearPresenceAlert}
              className="rounded p-1 hover:bg-[rgba(237,237,237,0.08)]"
              aria-label="Đóng cảnh báo"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          )}
        </div>
      )}

      {/* Notification Banner (@human / max_turns / error) */}
      {latestNotification && (
        <div className="flex items-center justify-between border-b border-[#5b9cf6]/25 bg-[#5b9cf6]/10 px-5 py-2 text-xs text-[#d6e6fd]">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 shrink-0 text-[#5b9cf6]" strokeWidth={1.5} />
            <span className="font-medium">{latestNotification.title}:</span>
            <span className="truncate">{latestNotification.body}</span>
          </div>
          <button
            type="button"
            onClick={clearNotification}
            className="rounded p-1 hover:bg-[rgba(237,237,237,0.08)]"
            aria-label="Đóng thông báo"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
      )}

      {/* Banners */}
      {(errorBanner || orchestratorNotice) && (
        <div
          className={`flex items-center justify-between border-b px-5 py-2 text-xs ${
            errorBanner
              ? 'border-[#e5484d]/30 bg-[#e5484d]/10 text-[#f3a8aa]'
              : 'border-[rgba(237,237,237,0.08)] bg-[#19191b] text-[#a1a1a6]'
          }`}
        >
          <span>{errorBanner || orchestratorNotice}</span>
          <button
            type="button"
            onClick={clearError}
            className="rounded p-1 hover:bg-[rgba(237,237,237,0.08)]"
            aria-label="Đóng thông báo"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
      )}

      {/* Body: Chat Feed + Optional Raw Markdown Split View */}
      <div className="flex min-h-0 flex-1">
        <div className={`flex min-w-0 flex-col ${splitView ? 'w-1/2' : 'w-full'}`}>
          <div className="flex-1 space-y-3 overflow-y-auto p-5">
            {activeDoc.messages.length === 0 && !streamingCardMsg && (
              <div className="rounded-xl border border-dashed border-[rgba(237,237,237,0.1)] p-8 text-center text-xs text-[#85858b]">
                Phòng thảo luận chưa có tin nhắn. Nhập đề bài bên dưới hoặc nhấn Chạy tự động
              </div>
            )}

            {activeDoc.messages.map((msg) => {
              const seenBy = presenceList
                .filter((p) => p.seenMessageId === msg.id && p.seenFile === activeDoc.filePath)
                .map((p) => ({ agentId: p.agentId, seenAt: p.seenAt }));
              return (
                <MessageCard
                  key={msg.id}
                  message={msg}
                  agent={agentsMap.get(msg.author)}
                  seenBy={seenBy}
                  onEdit={handleEdit}
                  onBranch={handleBranch}
                  onRerun={handleRerun}
                />
              );
            })}

            {streamingCardMsg && (
              <MessageCard
                message={streamingCardMsg}
                agent={agentsMap.get(streamingCardMsg.author)}
                isStreaming
              />
            )}

            {!streamingCardMsg &&
              activeExternalList
                .filter((p) => p.status !== 'needs_approval')
                .map((p) => (
                  <div
                    key={`typing-${p.agentId}`}
                    className="flex items-center gap-2.5 rounded-xl border border-[rgba(237,237,237,0.08)] bg-[#19191b] px-4 py-2.5 font-mono text-xs text-[#a1a1a6] tabular-nums"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: presenceDotColor(p.status) }}
                    />
                    <span className="text-[#ededed]">{p.agentId}</span>
                    <span>· {formatPresenceLabel(p, nowMs)}...</span>
                  </div>
                ))}
            <div ref={feedEndRef} />
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => void handleSend(e)}
            className="border-t border-[rgba(237,237,237,0.08)] bg-[#141415] px-5 py-3"
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-[#85858b]">Gọi nhanh</span>
                {activeDoc.meta.agents.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => appendComposerToken(`@${a.id}`)}
                    className="rounded-md border border-[rgba(237,237,237,0.08)] bg-[#19191b] px-2 py-0.5 font-mono text-xs text-[#a1a1a6] transition-colors duration-150 hover:border-[rgba(237,237,237,0.18)] hover:text-[#ededed]"
                  >
                    @{a.id}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-[#a1a1a6]">
                  <input
                    type="checkbox"
                    checked={autoRunOnSend}
                    onChange={(e) => setAutoRunOnSend(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-[rgba(237,237,237,0.2)] bg-[#19191b] accent-[#ededed]"
                  />
                  Tự chạy AI sau khi gửi
                </label>
                <span className="hidden items-center gap-1 text-xs text-[#85858b] sm:inline-flex">
                  <kbd className="kbd-cap">Ctrl+Enter</kbd>
                </span>
              </div>
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
                placeholder="Nhắn tới phòng (@agent hoặc @file:path)"
                className="flex-1 resize-none rounded-lg border border-[rgba(237,237,237,0.1)] bg-[#19191b] px-3 py-2 text-[14px] text-[#ededed] placeholder:text-[#85858b] focus:border-[#5b9cf6] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!composerText.trim() || sending}
                className="inline-flex h-9 items-center gap-1.5 self-end rounded-lg bg-[#ededed] px-4 text-xs font-medium text-[#141415] transition-colors duration-150 hover:bg-white active:scale-[0.98] disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" strokeWidth={1.75} />
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
