import { useEffect, useState } from 'react';
import { GitCompare, GitMerge, RefreshCw, Send, Trash2, X } from 'lucide-react';
import type { GitDiffPayload, WorktreeInfo } from '@synapse/shared';
import { api } from '../lib/api.ts';
import { useSynapseStore } from '../store/useSynapseStore.ts';

interface DiffDrawerModalProps {
  open: boolean;
  onClose: () => void;
}

export function DiffDrawerModal({ open, onClose }: DiffDrawerModalProps) {
  const { activeDoc, orchestratorRunning } = useSynapseStore();
  const [payload, setPayload] = useState<GitDiffPayload | null>(null);
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [selectedWorktree, setSelectedWorktree] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [busyAction, setBusyAction] = useState<'merge' | 'remove' | null>(null);
  const [reviewerId, setReviewerId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadDiff = async (targetAgentId = selectedWorktree) => {
    setLoading(true);
    setError(null);
    try {
      const [diffRes, wtRes] = await Promise.all([
        api.getGitDiff(targetAgentId || undefined),
        api.listWorktrees().catch(() => ({ worktrees: [] })),
      ]);
      setWorktrees(wtRes.worktrees);
      setPayload(diffRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không đọc được git diff');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setNotice(null);
    void loadDiff(selectedWorktree);
    if (activeDoc && activeDoc.meta.agents.length > 0) {
      const preferred =
        activeDoc.meta.agents.find((a) => /review|claude/i.test(`${a.id} ${a.role || ''}`)) ??
        activeDoc.meta.agents[0];
      setReviewerId(preferred.id);
    }
  }, [open, activeDoc?.filePath]);

  if (!open) return null;

  const activeWorktreeInfo = worktrees.find((w) => w.agentId === selectedWorktree);

  const handleSelectTarget = (nextTarget: string) => {
    setSelectedWorktree(nextTarget);
    setNotice(null);
    void loadDiff(nextTarget);
  };

  const handleSendReview = async () => {
    if (!activeDoc) return;
    setSending(true);
    setError(null);
    try {
      await api.triggerDiffReview(activeDoc.filePath, reviewerId || undefined, selectedWorktree || undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không gửi được diff cho reviewer');
    } finally {
      setSending(false);
    }
  };

  const handleMergeWorktree = async () => {
    if (!selectedWorktree) return;
    setBusyAction('merge');
    setError(null);
    setNotice(null);
    try {
      const res = await api.mergeWorktree(selectedWorktree);
      setNotice(res.summary);
      await loadDiff(selectedWorktree);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Merge worktree thất bại');
    } finally {
      setBusyAction(null);
    }
  };

  const handleRemoveWorktree = async () => {
    if (!selectedWorktree) return;
    const ok = window.confirm(
      `Xóa worktree @${selectedWorktree} và branch synapse/${selectedWorktree}? Commit chưa merge sẽ mất, lượt đang chạy của @${selectedWorktree} sẽ dừng.`
    );
    if (!ok) return;
    setBusyAction('remove');
    setError(null);
    setNotice(null);
    try {
      const removedId = selectedWorktree;
      await api.removeWorktree(removedId);
      setSelectedWorktree('');
      setNotice(`Đã xóa worktree @${removedId}.`);
      await loadDiff('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không xóa được worktree');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      style={{ backgroundColor: 'var(--scrim)' }}
    >
      <div className="glass-modal flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-[24px]">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line-soft)] px-5 py-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <GitCompare className="h-4 w-4 text-[var(--accent)]" strokeWidth={1.6} />
            <h3
              className="text-[15px] font-bold text-[var(--ink)]"
              style={{ fontFamily: 'var(--font-head)' }}
            >
              Review gate · git diff
            </h3>
            <select
              value={selectedWorktree}
              onChange={(e) => handleSelectTarget(e.target.value)}
              aria-label="Chọn nhánh git cần xem diff"
              className="glass-input h-7 rounded-lg px-2 text-xs"
            >
              <option value="">Repo chính</option>
              {worktrees.map((wt) => (
                <option key={wt.agentId} value={wt.agentId}>
                  worktree (@{wt.agentId}){wt.aheadCount > 0 ? ` · ${wt.aheadCount} commit` : ''}
                  {wt.dirty ? ' · dirty' : ''}
                </option>
              ))}
            </select>
            {payload?.branch && (
              <span className="glass-sub rounded-lg px-2 py-0.5 font-mono text-xs text-[var(--ink-2)]">
                {payload.branch}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeWorktreeInfo && (
              <>
                <button
                  type="button"
                  onClick={() => void handleMergeWorktree()}
                  disabled={busyAction !== null || loading}
                  className="inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-semibold disabled:opacity-40"
                  style={{
                    borderColor: 'color-mix(in oklch, var(--positive) 40%, transparent)',
                    backgroundColor: 'var(--positive-soft)',
                    color: 'var(--positive)',
                  }}
                >
                  <GitMerge className="h-3.5 w-3.5" strokeWidth={1.6} />
                  {busyAction === 'merge' ? 'Đang merge' : 'Merge'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleRemoveWorktree()}
                  disabled={busyAction !== null || loading}
                  className="glass-btn inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs text-[var(--ink-2)] hover:text-[var(--negative)] disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                  {busyAction === 'remove' ? 'Đang xóa' : 'Xóa worktree'}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => void loadDiff(selectedWorktree)}
              disabled={loading}
              className="glass-btn inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium"
            >
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
              Làm mới
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-[var(--ink-3)] hover:bg-[var(--glass-2)] hover:text-[var(--ink)]"
              aria-label="Đóng"
            >
              <X className="h-4 w-4" strokeWidth={1.6} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {notice && (
            <div
              className="mb-3 rounded-xl border px-3 py-2 text-xs font-medium"
              style={{
                borderColor: 'color-mix(in oklch, var(--positive) 35%, transparent)',
                backgroundColor: 'var(--positive-soft)',
                color: 'var(--positive)',
              }}
            >
              {notice}
            </div>
          )}
          {error && (
            <div
              className="mb-3 rounded-xl border px-3 py-2 text-xs font-medium"
              style={{
                borderColor: 'color-mix(in oklch, var(--negative) 35%, transparent)',
                backgroundColor: 'var(--negative-soft)',
                color: 'var(--negative)',
              }}
            >
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-xs text-[var(--ink-3)]">Đang đọc git diff...</p>
          ) : !payload?.isGitRepo ? (
            <p className="text-xs text-[var(--ink-3)]">Thư mục dự án hiện tại chưa khởi tạo Git.</p>
          ) : !payload.diff && !payload.statusShort ? (
            <p className="text-xs text-[var(--ink-3)]">Working tree sạch, chưa có thay đổi nào để review.</p>
          ) : (
            <div className="space-y-4">
              {payload.statusShort && (
                <div>
                  <div className="mb-1.5 text-xs font-semibold text-[var(--ink-2)]">Trạng thái file</div>
                  <pre className="glass-sub overflow-x-auto rounded-xl p-3 font-mono text-xs text-[var(--ink)]">
                    {payload.statusShort}
                  </pre>
                </div>
              )}

              {payload.diffStat && (
                <div>
                  <div className="mb-1.5 text-xs font-semibold text-[var(--ink-2)]">Tóm tắt thay đổi</div>
                  <pre className="glass-sub overflow-x-auto rounded-xl p-3 font-mono text-xs text-[var(--ink-2)]">
                    {payload.diffStat}
                  </pre>
                </div>
              )}

              {payload.diff && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-[var(--ink-2)]">
                    <span>Chi tiết diff</span>
                    {payload.truncated && (
                      <span style={{ color: 'var(--warning)' }}>Đã rút gọn 32 KB</span>
                    )}
                  </div>
                  <pre className="glass-sub overflow-x-auto rounded-xl p-3 font-mono text-xs leading-relaxed">
                    {payload.diff.split('\n').map((line, idx) => {
                      const style: React.CSSProperties =
                        line.startsWith('+') && !line.startsWith('+++')
                          ? { color: 'var(--positive)' }
                          : line.startsWith('-') && !line.startsWith('---')
                            ? { color: 'var(--negative)' }
                            : line.startsWith('@@')
                              ? { color: 'var(--accent)' }
                              : line.startsWith('diff ')
                                ? { color: 'var(--ink)', fontWeight: 600 }
                                : { color: 'var(--ink-2)' };
                      return (
                        <div key={idx} style={style}>
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line-soft)] px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[var(--ink-3)]">Reviewer</span>
            <select
              value={reviewerId}
              onChange={(e) => setReviewerId(e.target.value)}
              disabled={!activeDoc || activeDoc.meta.agents.length === 0}
              className="glass-input h-8 rounded-xl px-2.5 text-xs"
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
              className="glass-btn h-8 rounded-full px-4 text-xs font-semibold"
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
              className="glass-btn-solid inline-flex h-8 items-center gap-1.5 rounded-full px-4 text-xs font-semibold disabled:opacity-40"
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
