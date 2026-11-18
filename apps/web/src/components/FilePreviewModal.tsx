import { FileCode2, X } from 'lucide-react';
import { useSynapseStore } from '../store/useSynapseStore.ts';

export function FilePreviewModal() {
  const { filePreview, closeFilePreview, appendComposerToken } = useSynapseStore();

  if (!filePreview) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-[rgba(237,237,237,0.12)] bg-[#141415] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[rgba(237,237,237,0.08)] px-4 py-3">
          <div className="flex items-center gap-2">
            <FileCode2 className="h-4 w-4 text-[#85858b]" strokeWidth={1.5} />
            <span className="font-mono text-xs text-[#ededed]">{filePreview.path}</span>
            {filePreview.truncated && (
              <span className="rounded bg-[#232325] px-1.5 py-0.5 font-mono text-xs text-[#e5a04d]">
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
              className="h-8 rounded-lg bg-[#ededed] px-3 text-xs font-medium text-[#141415] hover:bg-white"
            >
              Chèn @file vào chat
            </button>
            <button
              type="button"
              onClick={closeFilePreview}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#85858b] hover:bg-[#232325] hover:text-[#ededed]"
              aria-label="Đóng"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>
        <pre className="flex-1 overflow-auto bg-[#0f0f10] p-4 font-mono text-xs leading-relaxed text-[#ededed]">
          {filePreview.content}
        </pre>
      </div>
    </div>
  );
}
