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
      setError(err instanceof Error ? err.message : 'Không thể chuyển thư mục dự án.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderGit2 className="h-4 w-4 text-indigo-400" />
            <h3 className="text-base font-semibold text-zinc-100">Trỏ vào thư mục dự án</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-3 text-xs text-zinc-400">
          Nhập đường dẫn thư mục dự án trên máy (tự động quét cả <code>chat.md</code> và <code>*.chat.md</code>).
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
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 focus:border-indigo-500 focus:outline-none"
          />

          {recent.length > 0 && (
            <div>
              <span className="mb-1.5 block text-[11px] font-medium text-zinc-500">Chọn nhanh dự án:</span>
              <div className="flex flex-col gap-1.5">
                {recent.map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleSwitch(dir)}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left font-mono text-xs transition ${
                      dir.toLowerCase() === workspaceRoot.toLowerCase()
                        ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-200'
                        : 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900'
                    }`}
                  >
                    <span className="truncate">{dir}</span>
                    {dir.toLowerCase() === workspaceRoot.toLowerCase() && (
                      <span className="ml-2 shrink-0 text-[10px] text-indigo-400">đang mở</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-rose-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting || !pathInput.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              {submitting ? 'Đang chuyển...' : 'Mở dự án'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
