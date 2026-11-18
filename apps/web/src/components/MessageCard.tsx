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
  Sparkles,
  User,
  X,
} from 'lucide-react';
import type { AgentConfig, ChatMessage } from '@synapse/shared';
import { useSynapseStore } from '../store/useSynapseStore.ts';

interface MessageCardProps {
  message: ChatMessage;
  agent?: AgentConfig;
  isStreaming?: boolean;
  onEdit?: (messageId: string, content: string) => Promise<void>;
  onBranch?: (messageId: string) => Promise<void>;
  onRerun?: (messageId: string) => Promise<void>;
}

export function MessageCard({
  message,
  agent,
  isStreaming = false,
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
  const accentColor = agent?.color ?? (isHuman ? '#38bdf8' : '#a1a1aa');

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

  return (
    <article
      className={`group relative rounded-xl border p-4 transition ${
        isStreaming
          ? 'border-indigo-500/60 bg-zinc-900/90 shadow-lg shadow-indigo-950/20'
          : isHuman
            ? 'border-sky-500/20 bg-zinc-900/55'
            : 'border-zinc-800/90 bg-zinc-900/75 hover:border-zinc-700/90'
      }`}
    >
      {/* Header */}
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold text-white shadow-sm"
            style={{ backgroundColor: accentColor }}
          >
            {isHuman ? <User className="h-4 w-4" /> : (agent?.name?.[0] || message.author[0]).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-zinc-100">
                {isHuman ? 'Bạn (@human)' : `${agent?.name || message.author} (@${message.author})`}
              </span>
              {message.meta?.target && (
                <span className="rounded bg-zinc-800/80 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                  → @{message.meta.target}
                </span>
              )}
              {agent?.role && (
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">
                  {agent.role}
                </span>
              )}
              {message.meta?.headingSuffix && (
                <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-amber-500/20">
                  {message.meta.headingSuffix.replace(/`/g, '')}
                </span>
              )}
              {message.meta?.model && (
                <span className="inline-flex items-center gap-1 rounded bg-indigo-500/10 px-1.5 py-0.5 font-mono text-[10px] text-indigo-300 ring-1 ring-indigo-500/20">
                  <Sparkles className="h-2.5 w-2.5" />
                  {message.meta.model}
                </span>
              )}
              {isStreaming && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                  Đang phản hồi...
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-500">
              <span>{message.id}</span>
              {formattedTime && <span>· {formattedTime}</span>}
              {message.meta?.tokens_out && (
                <span>
                  · {message.meta.tokens_in ?? 0} in / {message.meta.tokens_out} out tok
                </span>
              )}
              {message.meta?.duration_ms && <span>· {(message.meta.duration_ms / 1000).toFixed(1)}s</span>}
            </div>
          </div>
        </div>

        {/* Actions */}
        {!isStreaming && !editing && (
          <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
            {onEdit && (
              <button
                type="button"
                onClick={() => {
                  setDraft(message.content);
                  setEditing(true);
                }}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                title="Sửa nội dung trực tiếp trong .chat.md"
              >
                <Edit3 className="h-3 w-3" />
                Sửa
              </button>
            )}
            {onBranch && (
              <button
                type="button"
                onClick={() => void onBranch(message.id)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                title="Rẽ nhánh thành file .chat.md mới từ tin nhắn này"
              >
                <GitBranch className="h-3 w-3" />
                Branch
              </button>
            )}
            {onRerun && (
              <button
                type="button"
                onClick={() => void onRerun(message.id)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-indigo-300"
                title="Chạy lại AI từ điểm này"
              >
                <RotateCcw className="h-3 w-3" />
                Chạy lại
              </button>
            )}
          </div>
        )}
      </div>

      {/* Collapsible Thinking */}
      {message.thinking && (
        <div className="mb-3 rounded-lg border border-zinc-800 bg-zinc-950/70">
          <button
            type="button"
            onClick={() => setShowThinking((v) => !v)}
            className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs text-zinc-400 hover:text-zinc-200"
          >
            {showThinking ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <Brain className="h-3.5 w-3.5 text-purple-400" />
            <span>Quá trình suy nghĩ</span>
          </button>
          {showThinking && (
            <div className="border-t border-zinc-800/80 px-3 py-2 font-mono text-xs whitespace-pre-wrap text-zinc-400">
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
            className="w-full rounded-lg border border-indigo-500/50 bg-zinc-950 p-3 font-mono text-xs text-zinc-100 focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              <X className="h-3.5 w-3.5" />
              Hủy
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              {saving ? 'Đang lưu...' : 'Lưu vào .chat.md'}
            </button>
          </div>
        </div>
      ) : (
        <div className="synapse-markdown">
          <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {message.content || (isStreaming ? '▋' : '')}
          </Markdown>
        </div>
      )}

      {/* File references pills */}
      {message.fileRefs.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-zinc-800/70 pt-2.5">
          {message.fileRefs.map((file) => (
            <button
              key={file}
              type="button"
              onClick={() => void openFilePreview(file)}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-0.5 font-mono text-[11px] text-zinc-300 hover:border-indigo-500/50 hover:text-indigo-300"
            >
              <FileCode2 className="h-3 w-3 text-indigo-400" />
              {file}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
