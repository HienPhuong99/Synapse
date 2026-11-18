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
          className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
          {open ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-400/80" />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400/70" />
          )}
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
      className="group flex items-center justify-between rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100"
      style={{ paddingLeft: `${depth * 12 + 24}px` }}
    >
      <button
        type="button"
        onClick={() => (isChatMd ? void selectSession(node.path) : void openFilePreview(node.path))}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        title={node.path}
      >
        <FileCode2
          className={`h-3.5 w-3.5 shrink-0 ${isChatMd ? 'text-indigo-400' : 'text-zinc-500'}`}
        />
        <span className="truncate">{node.name}</span>
      </button>
      {!isChatMd && (
        <button
          type="button"
          onClick={() => appendComposerToken(`@file:${node.path}`)}
          className="hidden shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-indigo-300 hover:bg-indigo-600 hover:text-white group-hover:inline-block"
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
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-zinc-800/90 bg-zinc-950/90">
      <div className="flex items-center justify-between border-b border-zinc-800/90 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-indigo-500/20 text-xs font-bold text-indigo-400 ring-1 ring-indigo-500/40">
              S
            </span>
            <h1 className="text-sm font-semibold tracking-tight text-zinc-100">Synapse</h1>
            <span
              className={`h-2 w-2 rounded-full ${wsConnected ? 'bg-emerald-400' : 'bg-rose-500'}`}
              title={wsConnected ? 'WebSocket đã kết nối' : 'Đang kết nối lại WebSocket'}
            />
          </div>
          <button
            type="button"
            onClick={onSwitchWorkspace}
            className="mt-1 flex w-full items-center gap-1 rounded px-1 py-0.5 text-left font-mono text-[10px] text-zinc-400 hover:bg-zinc-800/80 hover:text-indigo-300"
            title="Nhấn để trỏ sang thư mục dự án khác (VD: D:\Code\ZeroPort)"
          >
            <FolderGit2 className="h-3 w-3 shrink-0 text-indigo-400" />
            <span className="truncate">{workspaceRoot || 'Chọn dự án'}</span>
          </button>
        </div>
        <button
          type="button"
          onClick={() => void loadWorkspace()}
          className="ml-2 rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          title="Làm mới workspace"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Sessions List */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Phiên thảo luận (.chat.md)
        </span>
        <button
          type="button"
          onClick={onNewSession}
          className="inline-flex items-center gap-1 rounded-md bg-indigo-600/90 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-500"
        >
          <Plus className="h-3 w-3" />
          Tạo mới
        </button>
      </div>

      <div className="max-h-64 space-y-1 overflow-y-auto px-2 pb-3">
        {sessions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-800 p-3 text-center text-xs text-zinc-500">
            Chưa có file <code>.chat.md</code> nào. Nhấn <b>Tạo mới</b> để bắt đầu.
          </div>
        ) : (
          sessions.map((s) => {
            const isActive = activePath === s.filePath;
            return (
              <button
                key={s.filePath}
                type="button"
                onClick={() => void selectSession(s.filePath)}
                className={`w-full rounded-lg border px-2.5 py-2 text-left transition ${
                  isActive
                    ? 'border-indigo-500/50 bg-indigo-500/10 text-zinc-100'
                    : 'border-transparent text-zinc-400 hover:border-zinc-800 hover:bg-zinc-900/70 hover:text-zinc-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <MessageSquareText className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
                    <span className="truncate text-xs font-medium">{s.title}</span>
                  </div>
                  {s.status === 'running' && (
                    <span className="shrink-0 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                      live
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-zinc-500">
                  <span className="truncate">{s.filePath}</span>
                  <span className="shrink-0">{s.messageCount} msg</span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Workspace File Tree */}
      <div className="border-t border-zinc-800/90 px-3 pt-3 pb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Thư mục dự án
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-1.5 pb-3">
        {files.map((node) => (
          <FileTreeItem key={node.path} node={node} />
        ))}
      </div>
    </aside>
  );
}
