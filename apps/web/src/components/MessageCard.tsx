import { useState } from 'react';
import Markdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import {
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Edit3,
  FileCode2,
  GitBranch,
  RotateCcw,
  User,
  X,
} from 'lucide-react';
import type { AgentConfig, ChatMessage } from '@synapse/shared';
import { highlightLanguages } from '../lib/highlightLanguages.ts';
import { useSynapseStore } from '../store/useSynapseStore.ts';

interface MessageCardProps {
  message: ChatMessage;
  agent?: AgentConfig;
  isStreaming?: boolean;
  seenBy?: { agentId: string; seenAt?: string }[];
  onEdit?: (messageId: string, content: string) => Promise<void>;
  onBranch?: (messageId: string) => Promise<void>;
  onRerun?: (messageId: string) => Promise<void>;
}

export function MessageCard({
  message,
  agent,
  isStreaming = false,
  seenBy = [],
  onEdit,
  onBranch,
  onRerun,
}: MessageCardProps) {
  const [showThinking, setShowThinking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [saving, setSaving] = useState(false);
  const openFilePreview = useSynapseStore((s) => s.openFilePreview);

  const isHuman = message.author.toLowerCase() === 'human' || message.author.toLowerCase() === 'user';
  const railColor = agent?.color ?? (isHuman ? 'var(--accent)' : 'var(--ink-3)');

  const handleSave = async () => {
    if (!onEdit || !draft.trim()) return;
    setSaving(true);
    try {
      await onEdit(message.id, draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const formattedTime = (() => {
    if (!message.timestamp) return '';
    const parsed = new Date(message.timestamp);
    if (Number.isNaN(parsed.getTime())) return message.timestamp;
    return parsed.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  })();

  const statusToneStyle = (() => {
    const s = message.meta?.headingSuffix ?? '';
    if (/\b(DONE|AGREED|FIXED)\b/i.test(s)) {
      return {
        color: 'var(--positive)',
        backgroundColor: 'var(--positive-soft)',
        borderColor: 'color-mix(in oklch, var(--positive) 35%, transparent)',
      };
    }
    if (/\bOPEN\b/i.test(s)) {
      return {
        color: 'var(--warning)',
        backgroundColor: 'var(--warning-soft)',
        borderColor: 'color-mix(in oklch, var(--warning) 35%, transparent)',
      };
    }
    return undefined;
  })();

  return (
    <article
      className={`glass group relative rounded-[22px] p-5 transition-all duration-150 ${
        isStreaming ? 'ring-1 ring-[var(--accent)]/50' : ''
      }`}
    >
      {/* Subtle colored rail pill inside rounded glass edge */}
      <span
        aria-hidden="true"
        className="absolute top-5 bottom-5 left-2.5 w-[3px] rounded-full opacity-85"
        style={{ backgroundColor: railColor }}
      />

      <div className="pl-2.5">
        {/* Header */}
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div
              className="app-icon-glass h-8 w-8 shrink-0 rounded-[10px] text-xs font-bold"
              style={
                isHuman
                  ? ({ '--h': 215, '--c': 0.14 } as React.CSSProperties)
                  : ({ '--h': 250, '--c': 0.12 } as React.CSSProperties)
              }
            >
              {isHuman ? (
                <User className="h-4 w-4" strokeWidth={1.7} />
              ) : (
                <span>{(agent?.name?.[0] || message.author[0]).toUpperCase()}</span>
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="text-[14px] font-semibold text-[var(--ink)]"
                  style={{ fontFamily: 'var(--font-head)' }}
                >
                  {isHuman ? 'Bạn' : agent?.name || message.author}
                </span>
                <span className="font-mono text-xs text-[var(--ink-3)]">@{message.author}</span>
                {message.meta?.target && (
                  <span className="font-mono text-xs text-[var(--ink-2)]">→ @{message.meta.target}</span>
                )}
                {agent?.role && (
                  <span className="glass-sub rounded-md px-1.5 py-0.5 text-xs text-[var(--ink-2)]">
                    {agent.role}
                  </span>
                )}
                {message.meta?.headingSuffix && (
                  <span
                    className={`rounded-md border px-1.5 py-0.5 text-xs font-medium ${
                      statusToneStyle ? '' : 'glass-sub text-[var(--ink-2)]'
                    }`}
                    style={statusToneStyle}
                  >
                    {message.meta.headingSuffix.replace(/`/g, '')}
                  </span>
                )}
                {isStreaming && (
                  <span
                    className="inline-flex items-center gap-1.5 text-xs font-medium"
                    style={{ color: 'var(--positive)' }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: 'var(--positive)' }}
                    />
                    Đang phản hồi
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-xs text-[var(--ink-3)] tabular-nums">
                <span>{message.id}</span>
                {formattedTime && <span>· {formattedTime}</span>}
                {message.meta?.model && <span>· {message.meta.model}</span>}
                {message.meta?.tokens_out && (
                  <span>
                    · {message.meta.tokens_in ?? 0}/{message.meta.tokens_out} tok
                  </span>
                )}
                {message.meta?.duration_ms && <span>· {(message.meta.duration_ms / 1000).toFixed(1)}s</span>}
              </div>
            </div>
          </div>

          {/* Actions */}
          {!isStreaming && !editing && (
            <div className="flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              {onEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setDraft(message.content);
                    setEditing(true);
                  }}
                  className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-[var(--ink-2)] transition-colors hover:bg-[var(--glass-2)] hover:text-[var(--ink)]"
                  title="Sửa trực tiếp trong file"
                >
                  <Edit3 className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Sửa
                </button>
              )}
              {onBranch && (
                <button
                  type="button"
                  onClick={() => void onBranch(message.id)}
                  className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-[var(--ink-2)] transition-colors hover:bg-[var(--glass-2)] hover:text-[var(--ink)]"
                  title="Rẽ nhánh thành file .chat.md mới"
                >
                  <GitBranch className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Branch
                </button>
              )}
              {onRerun && (
                <button
                  type="button"
                  onClick={() => void onRerun(message.id)}
                  className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-[var(--ink-2)] transition-colors hover:bg-[var(--glass-2)] hover:text-[var(--ink)]"
                  title="Chạy lại từ điểm này"
                >
                  <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Chạy lại
                </button>
              )}
            </div>
          )}
        </div>

        {/* Collapsible Thinking */}
        {message.thinking && (
          <div className="glass-sub mb-3 rounded-xl">
            <button
              type="button"
              onClick={() => setShowThinking((v) => !v)}
              className="flex h-8 w-full items-center gap-2 px-3 text-left text-xs text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]"
            >
              {showThinking ? (
                <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.6} />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.6} />
              )}
              <Brain className="h-3.5 w-3.5 text-[var(--accent)]" strokeWidth={1.5} />
              <span>Quá trình suy nghĩ</span>
            </button>
            {showThinking && (
              <div className="border-t border-[var(--line-soft)] px-3 py-2.5 font-mono text-xs whitespace-pre-wrap text-[var(--ink-2)]">
                {message.thinking}
              </div>
            )}
          </div>
        )}

        {/* Body or Inline Editor */}
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
              className="glass-input w-full rounded-xl p-3 font-mono text-xs"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="glass-btn inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-medium"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                Hủy
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="glass-btn-solid inline-flex h-8 items-center gap-1 rounded-full px-3.5 text-xs font-semibold disabled:opacity-40"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={1.8} />
                {saving ? 'Đang lưu' : 'Lưu vào file'}
              </button>
            </div>
          </div>
        ) : (
          <div className="synapse-markdown">
            <Markdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[[rehypeHighlight, { languages: highlightLanguages }]]}
            >
              {message.content || (isStreaming ? '▋' : '')}
            </Markdown>
          </div>
        )}

        {/* File references pills */}
        {message.fileRefs.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[var(--line-soft)] pt-3">
            {message.fileRefs.map((file) => (
              <button
                key={file}
                type="button"
                onClick={() => void openFilePreview(file)}
                className="glass-btn inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-xs text-[var(--ink-2)] hover:text-[var(--ink)]"
              >
                <FileCode2 className="h-3.5 w-3.5 text-[var(--accent)]" strokeWidth={1.5} />
                {file}
              </button>
            ))}
          </div>
        )}

        {/* Messenger-style Seen indicators */}
        {seenBy.length > 0 && (
          <div className="mt-2 flex flex-wrap justify-end gap-3 font-mono text-xs text-[var(--ink-3)] tabular-nums">
            {seenBy.map((s) => {
              const t = s.seenAt
                ? new Date(s.seenAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                : '';
              return (
                <span key={s.agentId}>
                  Đã xem: {s.agentId}
                  {t ? ` · ${t}` : ''}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </article>
  );
}
