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
          className="flex h-8 w-full items-center gap-2 rounded-xl px-2 text-left text-[13px] text-[var(--ink-2)] transition-colors duration-150 hover:bg-[var(--glass-2)] hover:text-[var(--ink)]"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <span className="flex w-4 shrink-0 items-center justify-center text-[var(--ink-3)]">
            {open ? (
              <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.6} />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.6} />
            )}
          </span>
          <span className="flex w-4 shrink-0 items-center justify-center text-[var(--ink-3)]">
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
      className="group flex h-8 items-center justify-between rounded-xl pr-2 text-[13px] text-[var(--ink-2)] transition-colors duration-150 hover:bg-[var(--glass-2)] hover:text-[var(--ink)]"
      style={{ paddingLeft: `${depth * 12 + 28}px` }}
    >
      <button
        type="button"
        onClick={() => (isChatMd ? void selectSession(node.path) : void openFilePreview(node.path))}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        title={node.path}
      >
        <span className="flex w-4 shrink-0 items-center justify-center text-[var(--ink-3)]">
          <FileCode2 className="h-4 w-4" strokeWidth={1.5} />
        </span>
        <span className={`truncate ${isChatMd ? 'font-medium text-[var(--ink)]' : ''}`}>{node.name}</span>
      </button>
      {!isChatMd && (
        <button
          type="button"
          onClick={() => appendComposerToken(`@file:${node.path}`)}
          className="glass-sub hidden shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px] text-[var(--ink-2)] hover:text-[var(--ink)] group-hover:inline-block"
          title="Chèn @file vào khung chat"
        >
          @tag
        </button>
      )}
    </div>
  );
}

export function SidebarLeft({ onNewSession, onSwitchWorkspace }: SidebarLeftProps) {
  const { sessions, files, activePath, workspaceRoot, selectSession } = useSynapseStore();

  return (
    <aside className="glass flex h-full w-[268px] shrink-0 flex-col overflow-hidden rounded-[22px]">
      {/* Mobile-only workspace switcher (desktop has it in TopMenubar) */}
      <div className="border-b border-[var(--line-soft)] px-3.5 py-2.5 sm:hidden">
        <button
          type="button"
          onClick={onSwitchWorkspace}
          className="glass-btn flex h-8 w-full items-center gap-2 rounded-xl px-2.5 text-left font-mono text-xs text-[var(--ink-2)]"
          title="Đổi thư mục dự án"
        >
          <FolderGit2 className="h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={1.5} />
          <span className="truncate">{workspaceRoot || 'Chọn dự án'}</span>
        </button>
      </div>

      {/* Sessions Section */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2.5">
        <span className="text-xs font-semibold text-[var(--ink-3)]">Phiên thảo luận</span>
        <button
          type="button"
          onClick={onNewSession}
          className="glass-btn-solid inline-flex h-7 items-center gap-1 rounded-full px-3 text-xs font-semibold active:scale-[0.98]"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.8} />
          Tạo mới
        </button>
      </div>

      <div className="max-h-64 space-y-1.5 overflow-y-auto px-3 pb-3">
        {sessions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--line)] p-3 text-center text-xs text-[var(--ink-3)]">
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
                className={`w-full rounded-xl border px-3 py-2 text-left transition-all duration-150 ${
                  isActive
                    ? 'glass-sub border-[var(--accent)]/40 text-[var(--ink)] shadow-sm'
                    : 'border-transparent text-[var(--ink-2)] hover:bg-[var(--glass-2)] hover:text-[var(--ink)]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <MessageSquareText
                      className={`h-4 w-4 shrink-0 ${isActive ? 'text-[var(--accent)]' : 'text-[var(--ink-3)]'}`}
                      strokeWidth={1.6}
                    />
                    <span className="truncate text-[13px] font-medium">{s.title}</span>
                  </div>
                  {s.status === 'running' && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: 'var(--positive)' }}
                      title="Đang chạy"
                    />
                  )}
                </div>
                <div className="mt-1 flex items-center justify-between pl-6 font-mono text-[11px] text-[var(--ink-3)] tabular-nums">
                  <span className="truncate">{s.filePath}</span>
                  <span className="shrink-0">{s.messageCount}</span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Project Files Tree */}
      <div className="border-t border-[var(--line-soft)] px-4 pt-3.5 pb-2">
        <span className="text-xs font-semibold text-[var(--ink-3)]">Thư mục dự án</span>
      </div>
      <div className="flex-1 overflow-y-auto px-2.5 pb-3">
        {files.map((node) => (
          <FileTreeItem key={node.path} node={node} />
        ))}
      </div>
    </aside>
  );
}
