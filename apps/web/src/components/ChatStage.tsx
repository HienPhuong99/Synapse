import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Bell,
  Columns2,
  GitCompare,
  Pause,
  Play,
  Send,
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
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="glass max-w-md space-y-4 rounded-[26px] p-8">
          <div className="app-icon-glass mx-auto h-12 w-12 rounded-[14px]">
            <TerminalSquare className="h-5 w-5" strokeWidth={1.6} />
          </div>
          <h2
            className="text-base font-bold text-[var(--ink)]"
            style={{ fontFamily: 'var(--font-head)' }}
          >
            Chưa chọn phiên thảo luận
          </h2>
          <p className="text-[13px] leading-relaxed text-[var(--ink-2)]">
            Chọn file <code>chat.md</code> hoặc <code>.chat.md</code> ở cột trái để theo dõi luồng trao đổi, hoặc
            tạo phòng thảo luận mới.
          </p>
          <div className="flex justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={onNewSession}
              className="glass-btn-solid h-9 rounded-full px-5 text-xs font-semibold active:scale-[0.98]"
            >
              Tạo phòng mới
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              className="glass-btn h-9 rounded-full px-4 text-xs font-semibold"
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
  const needsCompact = activeDoc.messages.length >= 5 || activeDoc.raw.split('\n').length > 120;

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
    <main className="flex min-w-0 flex-1 flex-col gap-3">
      {/* Top Bar */}
      <header className="glass flex min-h-14 flex-wrap items-center justify-between gap-3 rounded-[22px] px-5 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h2
              className="truncate text-[15px] font-bold text-[var(--ink)]"
              style={{ fontFamily: 'var(--font-head)' }}
            >
              {activeDoc.meta.title}
            </h2>
            <span className="glass-sub rounded-full px-2.5 py-0.5 font-mono text-[11px] text-[var(--ink-2)]">
              {activeDoc.meta.mode}
            </span>
            {orchestratorRunning && (
              <span
                className="inline-flex items-center gap-1.5 font-mono text-xs font-medium tabular-nums"
                style={{ color: 'var(--positive)' }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--positive)' }} />
                {turnCount}/{activeDoc.meta.max_turns}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate font-mono text-xs text-[var(--ink-3)]">{activeDoc.filePath}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {orchestratorRunning ? (
            <button
              type="button"
              onClick={() => void api.controlSession(activeDoc.filePath, 'pause')}
              className="inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 active:scale-[0.98]"
              style={{ backgroundColor: 'var(--negative)' }}
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
                className="glass-btn-solid inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold active:scale-[0.98] disabled:opacity-40"
                title="Để các AI Agent tự trao đổi liên tiếp tối đa max_turns lượt"
              >
                <Play className="h-3.5 w-3.5" strokeWidth={1.75} />
                Chạy tự động
              </button>
              <button
                type="button"
                onClick={() => void api.controlSession(activeDoc.filePath, 'step')}
                disabled={activeDoc.meta.agents.length === 0}
                className="glass-btn inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium disabled:opacity-40"
                title="Chạy tiếp 1 lượt AI"
              >
                <SkipForward className="h-3.5 w-3.5 text-[var(--ink-2)]" strokeWidth={1.5} />
                1 lượt
              </button>
              <button
                type="button"
                onClick={() => void api.controlSession(activeDoc.filePath, 'council')}
                disabled={activeDoc.meta.agents.length < 2}
                className="glass-btn inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium disabled:opacity-40"
                title="Hội đồng: các agent trả lời song song, chấm chéo ẩn danh và chủ tọa tổng hợp"
              >
                <Users className="h-3.5 w-3.5 text-[var(--ink-2)]" strokeWidth={1.5} />
                Hội đồng
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onOpenDiff}
            className="glass-btn inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium"
            style={
              isReadyForReview
                ? {
                    borderColor: 'color-mix(in oklch, var(--positive) 45%, transparent)',
                    backgroundColor: 'var(--positive-soft)',
                  }
                : undefined
            }
            title="Xem git diff và gửi cho Reviewer"
          >
            <GitCompare className="h-3.5 w-3.5 text-[var(--ink-2)]" strokeWidth={1.5} />
            {isReadyForReview && (
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--positive)' }} />
            )}
            Review diff
          </button>

          <button
            type="button"
            onClick={() => void api.compactSession(activeDoc.filePath, 2)}
            disabled={activeDoc.messages.length <= 2 || orchestratorRunning}
            className="glass-btn inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium disabled:opacity-40"
            style={
              needsCompact
                ? {
                    borderColor: 'color-mix(in oklch, var(--warning) 45%, transparent)',
                    backgroundColor: 'var(--warning-soft)',
                  }
                : undefined
            }
            title="Chuyển các lượt cũ sang archive, giữ 2 lượt mới nhất và tóm tắt vào Mục 1"
          >
            <Archive className="h-3.5 w-3.5 text-[var(--ink-2)]" strokeWidth={1.5} />
            Nén
          </button>

          <button
            type="button"
            onClick={() => setSplitView(!splitView)}
            className={`glass-btn inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium ${
              splitView ? 'ring-1 ring-[var(--accent)]/50' : ''
            }`}
            title="Xem và sửa song song file raw Markdown"
          >
            <Columns2 className="h-3.5 w-3.5 text-[var(--ink-2)]" strokeWidth={1.5} />
            Split .chat.md
          </button>
        </div>
      </header>

      {/* Live Presence Strip */}
      {presenceList.length > 0 && (
        <div className="glass flex flex-wrap items-center gap-3 rounded-2xl px-4 py-2 font-mono text-xs text-[var(--ink-2)] tabular-nums">
          {presenceList.map((p) => (
            <span key={p.agentId} className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: presenceDotColor(p.status) }} />
              <span className="font-semibold text-[var(--ink)]">{p.agentId}</span>
              <span className="text-[var(--ink-3)]">· {formatPresenceLabel(p, nowMs)}</span>
            </span>
          ))}
        </div>
      )}

      {/* Needs Approval Alert Banner */}
      {(presenceAlert || needsApprovalList.length > 0) && (
        <div
          className="glass flex items-center justify-between rounded-2xl px-4 py-2.5 text-xs font-medium text-[var(--ink)]"
          style={{
            borderColor: 'color-mix(in oklch, var(--warning) 40%, transparent)',
            backgroundColor: 'var(--warning-soft)',
          }}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: 'var(--warning)' }} strokeWidth={1.6} />
            <span>
              {presenceAlert?.body ||
                `${needsApprovalList.map((p) => `${p.agentId}: ${p.detail || 'Cần bạn duyệt'}`).join(' · ')}`}
            </span>
          </div>
          {presenceAlert && (
            <button
              type="button"
              onClick={clearPresenceAlert}
              className="rounded-lg p-1 hover:bg-[var(--glass-2)]"
              aria-label="Đóng cảnh báo"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.6} />
            </button>
          )}
        </div>
      )}

      {/* Notification Banner (@human / max_turns / error) */}
      {latestNotification && (
        <div
          className="glass flex items-center justify-between rounded-2xl px-4 py-2.5 text-xs text-[var(--ink)]"
          style={{
            borderColor: 'color-mix(in oklch, var(--accent) 40%, transparent)',
            backgroundColor: 'var(--accent-soft)',
          }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <Bell className="h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={1.6} />
            <span className="font-semibold">{latestNotification.title}:</span>
            <span className="truncate">{latestNotification.body}</span>
          </div>
          <button
            type="button"
            onClick={clearNotification}
            className="rounded-lg p-1 hover:bg-[var(--glass-2)]"
            aria-label="Đóng thông báo"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.6} />
          </button>
        </div>
      )}

      {/* Banners */}
      {(errorBanner || orchestratorNotice) && (
        <div
          className="glass flex items-center justify-between rounded-2xl px-4 py-2.5 text-xs"
          style={
            errorBanner
              ? {
                  borderColor: 'color-mix(in oklch, var(--negative) 40%, transparent)',
                  backgroundColor: 'var(--negative-soft)',
                  color: 'var(--negative)',
                }
              : { color: 'var(--ink-2)' }
          }
        >
          <span>{errorBanner || orchestratorNotice}</span>
          <button
            type="button"
            onClick={clearError}
            className="rounded-lg p-1 hover:bg-[var(--glass-2)]"
            aria-label="Đóng thông báo"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.6} />
          </button>
        </div>
      )}

      {/* Body: Chat Feed + Optional Raw Markdown Split View */}
      <div className="flex min-h-0 flex-1 gap-3">
        <div className={`flex min-w-0 flex-col gap-3 ${splitView ? 'w-1/2' : 'w-full'}`}>
          <div className="flex-1 space-y-3 overflow-y-auto pr-1">
            {activeDoc.messages.length === 0 && !streamingCardMsg && (
              <div className="glass rounded-[22px] border-dashed p-8 text-center text-xs text-[var(--ink-3)]">
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
                    className="glass flex items-center gap-2.5 rounded-2xl px-4 py-2.5 font-mono text-xs text-[var(--ink-2)] tabular-nums"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: presenceDotColor(p.status) }}
                    />
                    <span className="font-semibold text-[var(--ink)]">{p.agentId}</span>
                    <span>· {formatPresenceLabel(p, nowMs)}...</span>
                  </div>
                ))}
            <div ref={feedEndRef} />
          </div>

          {/* Composer */}
          <form onSubmit={(e) => void handleSend(e)} className="glass rounded-[22px] px-4 py-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-[var(--ink-3)]">Gọi nhanh</span>
                {activeDoc.meta.agents.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => appendComposerToken(`@${a.id}`)}
                    className="glass-btn rounded-full px-2.5 py-0.5 font-mono text-xs text-[var(--ink-2)] hover:text-[var(--ink)]"
                  >
                    @{a.id}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--ink-2)]">
                  <input
                    type="checkbox"
                    checked={autoRunOnSend}
                    onChange={(e) => setAutoRunOnSend(e.target.checked)}
                    className="h-3.5 w-3.5 rounded accent-[var(--accent)]"
                  />
                  Tự chạy AI sau khi gửi
                </label>
                <span className="hidden items-center gap-1 text-xs text-[var(--ink-3)] sm:inline-flex">
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
                className="glass-input flex-1 resize-none rounded-xl px-3 py-2 text-[14px]"
              />
              <button
                type="submit"
                disabled={!composerText.trim() || sending}
                className="glass-btn-solid inline-flex h-9 items-center gap-1.5 self-end rounded-full px-4 text-xs font-semibold active:scale-[0.98] disabled:opacity-40"
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
