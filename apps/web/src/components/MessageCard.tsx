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
  const railColor = agent?.color ?? (isHuman ? '#5b9cf6' : '#85858b');

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

  const statusTone = (() => {
    const s = message.meta?.headingSuffix ?? '';
    if (/\b(DONE|AGREED|FIXED)\b/i.test(s)) return 'text-[#4cc38a] border-[#4cc38a]/25 bg-[#4cc38a]/10';
    if (/\bOPEN\b/i.test(s)) return 'text-[#e5a04d] border-[#e5a04d]/25 bg-[#e5a04d]/10';
    return 'text-[#a1a1a6] border-[rgba(237,237,237,0.1)] bg-[#232325]';
  })();

  return (
    <article
      className={`group relative rounded-xl border bg-[#19191b] p-5 transition-colors duration-150 ${
        isStreaming
          ? 'border-[rgba(237,237,237,0.2)]'
          : 'border-[rgba(237,237,237,0.08)] hover:border-[rgba(237,237,237,0.14)]'
      }`}
      style={{ borderLeftWidth: '2px', borderLeftColor: railColor }}
    >
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[rgba(237,237,237,0.1)] bg-[#232325] text-xs font-medium text-[#ededed]"
          >
            {isHuman ? (
              <User className="h-4 w-4 text-[#85858b]" strokeWidth={1.5} />
            ) : (
              <span>{(agent?.name?.[0] || message.author[0]).toUpperCase()}</span>
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-medium text-[#ededed]">
                {isHuman ? 'Bạn' : agent?.name || message.author}
              </span>
              <span className="font-mono text-xs text-[#85858b]">@{message.author}</span>
              {message.meta?.target && (
                <span className="font-mono text-xs text-[#a1a1a6]">→ @{message.meta.target}</span>
              )}
              {agent?.role && (
                <span className="rounded bg-[#232325] px-1.5 py-0.5 text-xs text-[#a1a1a6]">
                  {agent.role}
                </span>
              )}
              {message.meta?.headingSuffix && (
                <span className={`rounded border px-1.5 py-0.5 text-xs ${statusTone}`}>
                  {message.meta.headingSuffix.replace(/`/g, '')}
                </span>
              )}
              {isStreaming && (
                <span className="inline-flex items-center gap-1.5 text-xs text-[#4cc38a]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#4cc38a]" />
                  Đang phản hồi
                </span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-xs text-[#85858b] tabular-nums">
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
                className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-[#85858b] transition-colors duration-150 hover:bg-[#232325] hover:text-[#ededed]"
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
                className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-[#85858b] transition-colors duration-150 hover:bg-[#232325] hover:text-[#ededed]"
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
                className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-[#85858b] transition-colors duration-150 hover:bg-[#232325] hover:text-[#ededed]"
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
        <div className="mb-3 rounded-lg border border-[rgba(237,237,237,0.08)] bg-[#141415]">
          <button
            type="button"
            onClick={() => setShowThinking((v) => !v)}
            className="flex h-8 w-full items-center gap-2 px-3 text-left text-xs text-[#85858b] transition-colors duration-150 hover:text-[#ededed]"
          >
            {showThinking ? (
              <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} />
            )}
            <Brain className="h-3.5 w-3.5" strokeWidth={1.5} />
            <span>Quá trình suy nghĩ</span>
          </button>
          {showThinking && (
            <div className="border-t border-[rgba(237,237,237,0.08)] px-3 py-2.5 font-mono text-xs whitespace-pre-wrap text-[#a1a1a6]">
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
            className="w-full rounded-lg border border-[rgba(237,237,237,0.16)] bg-[#141415] p-3 font-mono text-xs text-[#ededed] focus:border-[#5b9cf6] focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-[rgba(237,237,237,0.1)] bg-[#232325] px-3 text-xs text-[#ededed] hover:bg-[#2a2a2d]"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.5} />
              Hủy
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#ededed] px-3 text-xs font-medium text-[#141415] hover:bg-white disabled:opacity-40"
            >
              <Check className="h-3.5 w-3.5" strokeWidth={1.75} />
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
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[rgba(237,237,237,0.08)] pt-3">
          {message.fileRefs.map((file) => (
            <button
              key={file}
              type="button"
              onClick={() => void openFilePreview(file)}
              className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(237,237,237,0.08)] bg-[#141415] px-2 py-1 font-mono text-xs text-[#a1a1a6] transition-colors duration-150 hover:border-[rgba(237,237,237,0.18)] hover:text-[#ededed]"
            >
              <FileCode2 className="h-3.5 w-3.5 text-[#85858b]" strokeWidth={1.5} />
              {file}
            </button>
          ))}
        </div>
      )}

      {/* Messenger-style Seen indicators */}
      {seenBy.length > 0 && (
        <div className="mt-2 flex flex-wrap justify-end gap-3 font-mono text-xs text-[#85858b] tabular-nums">
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
    </article>
  );
}
