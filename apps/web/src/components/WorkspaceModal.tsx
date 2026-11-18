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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-[rgba(237,237,237,0.12)] bg-[#141415] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderGit2 className="h-4 w-4 text-[#85858b]" strokeWidth={1.5} />
            <h3 className="text-[15px] font-medium text-[#ededed]">Trỏ vào thư mục dự án</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#85858b] hover:bg-[#232325] hover:text-[#ededed]"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <p className="mb-3 text-xs text-[#a1a1a6]">
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
            className="h-9 w-full rounded-lg border border-[rgba(237,237,237,0.1)] bg-[#19191b] px-3 font-mono text-xs text-[#ededed] focus:border-[#5b9cf6] focus:outline-none"
          />

          {recent.length > 0 && (
            <div>
              <span className="mb-2 block text-xs text-[#85858b]">Chọn nhanh dự án</span>
              <div className="flex flex-col gap-1.5">
                {recent.map((dir) => {
                  const isCurrent = dir.toLowerCase() === workspaceRoot.toLowerCase();
                  return (
                    <button
                      key={dir}
                      type="button"
                      disabled={submitting}
                      onClick={() => void handleSwitch(dir)}
                      className={`flex h-9 items-center justify-between rounded-lg border px-3 text-left font-mono text-xs transition-colors duration-150 ${
                        isCurrent
                          ? 'border-[rgba(237,237,237,0.16)] bg-[#232325] text-[#ededed]'
                          : 'border-[rgba(237,237,237,0.08)] bg-[#19191b] text-[#a1a1a6] hover:bg-[#232325] hover:text-[#ededed]'
                      }`}
                    >
                      <span className="truncate">{dir}</span>
                      {isCurrent && <span className="ml-2 shrink-0 text-xs text-[#4cc38a]">đang mở</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-[#e5484d]">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-lg border border-[rgba(237,237,237,0.1)] bg-[#232325] px-4 text-xs text-[#ededed] hover:bg-[#2a2a2d]"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting || !pathInput.trim()}
              className="h-9 rounded-lg bg-[#ededed] px-4 text-xs font-medium text-[#141415] hover:bg-white disabled:opacity-40"
            >
              {submitting ? 'Đang chuyển' : 'Mở dự án'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
