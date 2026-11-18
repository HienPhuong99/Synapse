import { useEffect, useState } from 'react';
import { GitCompare, RefreshCw, Send, X } from 'lucide-react';
import type { GitDiffPayload } from '@synapse/shared';
import { api } from '../lib/api.ts';
import { useSynapseStore } from '../store/useSynapseStore.ts';

interface DiffDrawerModalProps {
  open: boolean;
  onClose: () => void;
}

export function DiffDrawerModal({ open, onClose }: DiffDrawerModalProps) {
  const { activeDoc, orchestratorRunning } = useSynapseStore();
  const [payload, setPayload] = useState<GitDiffPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [reviewerId, setReviewerId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadDiff = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getGitDiff();
      setPayload(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không đọc được git diff');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void loadDiff();
    if (activeDoc && activeDoc.meta.agents.length > 0) {
      const preferred =
        activeDoc.meta.agents.find((a) => /review|claude/i.test(`${a.id} ${a.role || ''}`)) ??
        activeDoc.meta.agents[0];
      setReviewerId(preferred.id);
    }
  }, [open, activeDoc?.filePath]);

  if (!open) return null;

  const handleSendReview = async () => {
    if (!activeDoc) return;
    setSending(true);
    setError(null);
    try {
      await api.triggerDiffReview(activeDoc.filePath, reviewerId || undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không gửi được diff cho reviewer');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col rounded-2xl border border-[rgba(237,237,237,0.12)] bg-[#141415] shadow-2xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(237,237,237,0.08)] px-5 py-3">
          <div className="flex items-center gap-2">
            <GitCompare className="h-4 w-4 text-[#85858b]" strokeWidth={1.5} />
            <h3 className="text-[14px] font-medium text-[#ededed]">Review gate · git diff</h3>
            {payload?.branch && (
              <span className="rounded bg-[#232325] px-1.5 py-0.5 font-mono text-xs text-[#a1a1a6]">
                {payload.branch}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadDiff()}
              disabled={loading}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[rgba(237,237,237,0.1)] bg-[#19191b] px-2.5 text-xs text-[#a1a1a6] hover:bg-[#232325] hover:text-[#ededed]"
            >
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
              Làm mới
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#85858b] hover:bg-[#232325] hover:text-[#ededed]"
              aria-label="Đóng"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-[#0f0f10] p-5">
          {error && (
            <div className="mb-3 rounded-lg border border-[#e5484d]/30 bg-[#e5484d]/10 px-3 py-2 text-xs text-[#f3a8aa]">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-xs text-[#85858b]">Đang đọc git diff...</p>
          ) : !payload?.isGitRepo ? (
            <p className="text-xs text-[#85858b]">Thư mục dự án hiện tại chưa khởi tạo Git.</p>
          ) : !payload.diff && !payload.statusShort ? (
            <p className="text-xs text-[#85858b]">Working tree sạch, chưa có thay đổi nào để review.</p>
          ) : (
            <div className="space-y-4">
              {payload.statusShort && (
                <div>
                  <div className="mb-1.5 text-xs font-medium text-[#a1a1a6]">Trạng thái file</div>
                  <pre className="overflow-x-auto rounded-lg border border-[rgba(237,237,237,0.08)] bg-[#141415] p-3 font-mono text-xs text-[#ededed]">
                    {payload.statusShort}
                  </pre>
                </div>
              )}

              {payload.diffStat && (
                <div>
                  <div className="mb-1.5 text-xs font-medium text-[#a1a1a6]">Tóm tắt thay đổi</div>
                  <pre className="overflow-x-auto rounded-lg border border-[rgba(237,237,237,0.08)] bg-[#141415] p-3 font-mono text-xs text-[#a1a1a6]">
                    {payload.diffStat}
                  </pre>
                </div>
              )}

              {payload.diff && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-[#a1a1a6]">
                    <span>Chi tiết diff</span>
                    {payload.truncated && <span className="text-[#e5a04d]">Đã rút gọn 32 KB</span>}
                  </div>
                  <pre className="overflow-x-auto rounded-lg border border-[rgba(237,237,237,0.08)] bg-[#141415] p-3 font-mono text-xs leading-relaxed">
                    {payload.diff.split('\n').map((line, idx) => {
                      const cls = line.startsWith('+') && !line.startsWith('+++')
                        ? 'text-[#4cc38a]'
                        : line.startsWith('-') && !line.startsWith('---')
                          ? 'text-[#e5484d]'
                          : line.startsWith('@@')
                            ? 'text-[#5b9cf6]'
                            : line.startsWith('diff ')
                              ? 'font-medium text-[#ededed]'
                              : 'text-[#a1a1a6]';
                      return (
                        <div key={idx} className={cls}>
                          {line || ' '}
                        </div>
                      );
                    })}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[rgba(237,237,237,0.08)] px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#85858b]">Reviewer</span>
            <select
              value={reviewerId}
              onChange={(e) => setReviewerId(e.target.value)}
              disabled={!activeDoc || activeDoc.meta.agents.length === 0}
              className="h-8 rounded-lg border border-[rgba(237,237,237,0.1)] bg-[#19191b] px-2.5 text-xs text-[#ededed] focus:border-[#5b9cf6] focus:outline-none"
            >
              {activeDoc?.meta.agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} (@{a.id})
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded-lg border border-[rgba(237,237,237,0.1)] bg-[#232325] px-3 text-xs text-[#ededed] hover:bg-[#2a2a2d]"
            >
              Đóng
            </button>
            <button
              type="button"
              disabled={
                sending ||
                orchestratorRunning ||
                !activeDoc ||
                !payload?.isGitRepo ||
                (!payload?.diff && !payload?.statusShort)
              }
              onClick={() => void handleSendReview()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#ededed] px-3.5 text-xs font-medium text-[#141415] hover:bg-white disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" strokeWidth={1.75} />
              {sending ? 'Đang gửi' : 'Gửi diff cho Reviewer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
