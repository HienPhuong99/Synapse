import { useEffect, useState } from 'react';
import { FolderGit2, X } from 'lucide-react';
import { useSynapseStore } from '../store/useSynapseStore.ts';

interface WorkspaceModalProps {
  open: boolean;
  onClose: () => void;
}

const STORAGE_KEY = 'synapse:recent-workspaces';

export function WorkspaceModal({ open, onClose }: WorkspaceModalProps) {
  const { workspaceRoot, switchWorkspace } = useSynapseStore();
  const [pathInput, setPathInput] = useState(workspaceRoot);
  const [recent, setRecent] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPathInput(workspaceRoot);
    setError(null);
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as string[];
      const merged = Array.from(new Set([workspaceRoot, 'D:\\Code\\ZeroPort', ...saved].filter(Boolean)));
      setRecent(merged.slice(0, 6));
    } catch {
      setRecent([workspaceRoot, 'D:\\Code\\ZeroPort'].filter(Boolean));
    }
  }, [open, workspaceRoot]);

  if (!open) return null;

  const handleSwitch = async (target: string) => {
    const clean = target.trim();
    if (!clean) return;
    setSubmitting(true);
    setError(null);
    try {
      await switchWorkspace(clean);
      const nextRecent = Array.from(new Set([clean, ...recent])).slice(0, 6);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRecent));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể chuyển thư mục dự án');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      style={{ backgroundColor: 'var(--scrim)' }}
    >
      <div className="glass-modal w-full max-w-lg rounded-[24px] p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderGit2 className="h-4 w-4 text-[var(--accent)]" strokeWidth={1.6} />
            <h3
              className="text-[16px] font-bold text-[var(--ink)]"
              style={{ fontFamily: 'var(--font-head)' }}
            >
              Trỏ vào thư mục dự án
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-[var(--ink-3)] hover:bg-[var(--glass-2)] hover:text-[var(--ink)]"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" strokeWidth={1.6} />
          </button>
        </div>

        <p className="mb-3 text-xs text-[var(--ink-2)]">
          Nhập đường dẫn thư mục dự án trên máy (tự động quét cả <code>chat.md</code> và <code>*.chat.md</code>)
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSwitch(pathInput);
          }}
          className="space-y-3"
        >
          <input
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            placeholder="D:\Code\ZeroPort"
            className="glass-input h-9 w-full rounded-xl px-3 font-mono text-xs"
          />

          {recent.length > 0 && (
            <div>
              <span className="mb-2 block text-xs font-medium text-[var(--ink-3)]">Chọn nhanh dự án</span>
              <div className="flex flex-col gap-1.5">
                {recent.map((dir) => {
                  const isCurrent = dir.toLowerCase() === workspaceRoot.toLowerCase();
                  return (
                    <button
                      key={dir}
                      type="button"
                      disabled={submitting}
                      onClick={() => void handleSwitch(dir)}
                      className={`glass-btn flex h-9 items-center justify-between rounded-xl px-3 text-left font-mono text-xs ${
                        isCurrent ? 'ring-1 ring-[var(--accent)]/50 text-[var(--ink)]' : 'text-[var(--ink-2)]'
                      }`}
                    >
                      <span className="truncate">{dir}</span>
                      {isCurrent && (
                        <span className="ml-2 shrink-0 text-xs font-semibold" style={{ color: 'var(--positive)' }}>
                          đang mở
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs font-medium" style={{ color: 'var(--negative)' }}>
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="glass-btn h-9 rounded-full px-4 text-xs font-semibold"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting || !pathInput.trim()}
              className="glass-btn-solid h-9 rounded-full px-5 text-xs font-semibold disabled:opacity-40"
            >
              {submitting ? 'Đang chuyển' : 'Mở dự án'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
