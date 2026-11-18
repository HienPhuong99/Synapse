import { FileCode2, X } from 'lucide-react';
import { useSynapseStore } from '../store/useSynapseStore.ts';

export function FilePreviewModal() {
  const { filePreview, closeFilePreview, appendComposerToken } = useSynapseStore();

  if (!filePreview) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      style={{ backgroundColor: 'var(--scrim)' }}
    >
      <div className="glass-modal flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-[24px]">
        <div className="flex items-center justify-between border-b border-[var(--line-soft)] px-5 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <FileCode2 className="h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={1.6} />
            <span className="truncate font-mono text-xs font-medium text-[var(--ink)]">
              {filePreview.path}
            </span>
            {filePreview.truncated && (
              <span
                className="glass-sub shrink-0 rounded-md px-1.5 py-0.5 font-mono text-xs"
                style={{ color: 'var(--warning)' }}
              >
                truncated
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                appendComposerToken(`@file:${filePreview.path}`);
                closeFilePreview();
              }}
              className="glass-btn-solid h-8 rounded-full px-4 text-xs font-semibold"
            >
              Chèn @file vào chat
            </button>
            <button
              type="button"
              onClick={closeFilePreview}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-[var(--ink-3)] hover:bg-[var(--glass-2)] hover:text-[var(--ink)]"
              aria-label="Đóng"
            >
              <X className="h-4 w-4" strokeWidth={1.6} />
            </button>
          </div>
        </div>
        <pre
          className="flex-1 overflow-auto p-5 font-mono text-xs leading-relaxed text-[var(--ink)]"
          style={{ backgroundColor: 'var(--code-bg)' }}
        >
          {filePreview.content}
        </pre>
      </div>
    </div>
  );
}
