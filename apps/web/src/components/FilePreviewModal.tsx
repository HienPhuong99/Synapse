import { FileCode2, X } from 'lucide-react';
import { useSynapseStore } from '../store/useSynapseStore.ts';

export function FilePreviewModal() {
  const { filePreview, closeFilePreview, appendComposerToken } = useSynapseStore();

  if (!filePreview) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <FileCode2 className="h-4 w-4 text-indigo-400" />
            <span className="font-mono text-xs font-medium text-zinc-100">{filePreview.path}</span>
            {filePreview.truncated && (
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">
                truncated
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                appendComposerToken(`@file:${filePreview.path}`);
                closeFilePreview();
              }}
              className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500"
            >
              Chèn @file vào chat
            </button>
            <button
              type="button"
              onClick={closeFilePreview}
              className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <pre className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed text-zinc-200">
          {filePreview.content}
        </pre>
      </div>
    </div>
  );
}
