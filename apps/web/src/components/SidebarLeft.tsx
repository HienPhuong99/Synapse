import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  Folder,
  FolderGit2,
  FolderOpen,
  MessageSquareText,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { isChatMdFilename, type FileTreeNode } from '@synapse/shared';
import { useSynapseStore } from '../store/useSynapseStore.ts';

interface SidebarLeftProps {
  onNewSession: () => void;
  onSwitchWorkspace: () => void;
}

function FileTreeItem({ node, depth = 0 }: { node: FileTreeNode; depth?: number }) {
  const [open, setOpen] = useState(depth < 1);
  const openFilePreview = useSynapseStore((s) => s.openFilePreview);
  const appendComposerToken = useSynapseStore((s) => s.appendComposerToken);
  const selectSession = useSynapseStore((s) => s.selectSession);

  if (node.type === 'dir') {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] text-[#a1a1a6] transition-colors duration-150 hover:bg-[#19191b] hover:text-[#ededed]"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <span className="flex w-4 shrink-0 items-center justify-center text-[#85858b]">
            {open ? (
              <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} />
            )}
          </span>
          <span className="flex w-4 shrink-0 items-center justify-center text-[#85858b]">
            {open ? (
              <FolderOpen className="h-4 w-4" strokeWidth={1.5} />
            ) : (
              <Folder className="h-4 w-4" strokeWidth={1.5} />
            )}
          </span>
          <span className="truncate">{node.name}</span>
        </button>
        {open &&
          node.children?.map((child) => <FileTreeItem key={child.path} node={child} depth={depth + 1} />)}
      </div>
    );
  }

  const isChatMd = isChatMdFilename(node.name);

  return (
    <div
      className="group flex h-8 items-center justify-between rounded-lg pr-2 text-[13px] text-[#a1a1a6] transition-colors duration-150 hover:bg-[#19191b] hover:text-[#ededed]"
      style={{ paddingLeft: `${depth * 12 + 28}px` }}
    >
      <button
        type="button"
        onClick={() => (isChatMd ? void selectSession(node.path) : void openFilePreview(node.path))}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        title={node.path}
      >
        <span className="flex w-4 shrink-0 items-center justify-center text-[#85858b]">
          <FileCode2 className="h-4 w-4" strokeWidth={1.5} />
        </span>
        <span className={`truncate ${isChatMd ? 'text-[#ededed]' : ''}`}>{node.name}</span>
      </button>
      {!isChatMd && (
        <button
          type="button"
          onClick={() => appendComposerToken(`@file:${node.path}`)}
          className="hidden shrink-0 rounded bg-[#232325] px-1.5 py-0.5 font-mono text-[11px] text-[#a1a1a6] hover:text-[#ededed] group-hover:inline-block"
          title="Chèn @file vào khung chat"
        >
          @tag
        </button>
      )}
    </div>
  );
}

export function SidebarLeft({ onNewSession, onSwitchWorkspace }: SidebarLeftProps) {
  const { sessions, files, activePath, workspaceRoot, wsConnected, selectSession, loadWorkspace } =
    useSynapseStore();

  return (
    <aside className="flex h-full w-[272px] shrink-0 flex-col border-r border-[rgba(237,237,237,0.08)] bg-[#0f0f10]">
      {/* Brand & Workspace Switcher */}
      <div className="border-b border-[rgba(237,237,237,0.08)] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg
              viewBox="0 0 20 20"
              fill="none"
              className="h-4 w-4 shrink-0 text-[#ededed]"
              aria-hidden="true"
            >
              <circle cx="5" cy="10" r="2.25" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="15" cy="5.5" r="2.25" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="15" cy="14.5" r="2.25" stroke="currentColor" strokeWidth="1.5" />
              <path d="M7.1 9.1L12.9 6.4M7.1 10.9L12.9 13.6" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <h1 className="text-[15px] font-semibold tracking-tight text-[#ededed]">Synapse</h1>
            <span
              className={`h-2 w-2 rounded-full ${wsConnected ? 'bg-[#4cc38a]' : 'bg-[#e5484d]'}`}
              title={wsConnected ? 'WebSocket đã kết nối' : 'Mất kết nối WebSocket'}
            />
          </div>
          <button
            type="button"
            onClick={() => void loadWorkspace()}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#85858b] transition-colors duration-150 hover:bg-[#19191b] hover:text-[#ededed]"
            title="Làm mới workspace"
            aria-label="Làm mới workspace"
          >
            <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <button
          type="button"
          onClick={onSwitchWorkspace}
          className="mt-2 flex h-8 w-full items-center gap-2 rounded-lg border border-[rgba(237,237,237,0.08)] bg-[#19191b] px-2.5 text-left font-mono text-xs text-[#a1a1a6] transition-colors duration-150 hover:border-[rgba(237,237,237,0.16)] hover:text-[#ededed]"
          title="Đổi thư mục dự án"
        >
          <FolderGit2 className="h-4 w-4 shrink-0 text-[#85858b]" strokeWidth={1.5} />
          <span className="truncate">{workspaceRoot || 'Chọn dự án'}</span>
        </button>
      </div>

      {/* Sessions Section */}
      <div className="flex items-center justify-between px-4 pt-5 pb-2">
        <span className="text-xs font-medium text-[#85858b]">Phiên thảo luận</span>
        <button
          type="button"
          onClick={onNewSession}
          className="inline-flex h-7 items-center gap-1 rounded-md bg-[#ededed] px-2.5 text-xs font-medium text-[#141415] transition-colors duration-150 hover:bg-white active:scale-[0.98]"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
          Tạo mới
        </button>
      </div>

      <div className="max-h-64 space-y-1 overflow-y-auto px-3 pb-3">
        {sessions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[rgba(237,237,237,0.1)] p-3 text-center text-xs text-[#85858b]">
            Chưa có file <code>chat.md</code> hoặc <code>.chat.md</code>
          </div>
        ) : (
          sessions.map((s) => {
            const isActive = activePath === s.filePath;
            return (
              <button
                key={s.filePath}
                type="button"
                onClick={() => void selectSession(s.filePath)}
                className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors duration-150 ${
                  isActive
                    ? 'border-[rgba(237,237,237,0.14)] bg-[#232325] text-[#ededed] shadow-[inset_0_1px_0_rgba(237,237,237,0.08)]'
                    : 'border-transparent text-[#a1a1a6] hover:bg-[#19191b] hover:text-[#ededed]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <MessageSquareText className="h-4 w-4 shrink-0 text-[#85858b]" strokeWidth={1.5} />
                    <span className="truncate text-[13px] font-medium">{s.title}</span>
                  </div>
                  {s.status === 'running' && (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-[#4cc38a]" title="Đang chạy" />
                  )}
                </div>
                <div className="mt-1 flex items-center justify-between pl-6 font-mono text-xs text-[#85858b] tabular-nums">
                  <span className="truncate">{s.filePath}</span>
                  <span className="shrink-0">{s.messageCount}</span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Project Files Tree */}
      <div className="border-t border-[rgba(237,237,237,0.08)] px-4 pt-4 pb-2">
        <span className="text-xs font-medium text-[#85858b]">Thư mục dự án</span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {files.map((node) => (
          <FileTreeItem key={node.path} node={node} />
        ))}
      </div>
    </aside>
  );
}
