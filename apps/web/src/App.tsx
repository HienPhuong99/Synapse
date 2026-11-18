import { useEffect, useState } from 'react';
import { connectWebSocket } from './lib/api.ts';
import { installGlassPointerGlow } from './lib/theme.ts';
import { useSynapseStore } from './store/useSynapseStore.ts';
import { ChatStage } from './components/ChatStage.tsx';
import { DiffDrawerModal } from './components/DiffDrawerModal.tsx';
import { FilePreviewModal } from './components/FilePreviewModal.tsx';
import { NewSessionModal } from './components/NewSessionModal.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { SidebarLeft } from './components/SidebarLeft.tsx';
import { SidebarRight } from './components/SidebarRight.tsx';
import { TopMenubar } from './components/TopMenubar.tsx';
import { WorkspaceModal } from './components/WorkspaceModal.tsx';

export function App() {
  const loadWorkspace = useSynapseStore((s) => s.loadWorkspace);
  const handleWsEvent = useSynapseStore((s) => s.handleWsEvent);
  const setWsConnected = useSynapseStore((s) => s.setWsConnected);

  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);

  useEffect(() => {
    void loadWorkspace();
    const disconnect = connectWebSocket(handleWsEvent, setWsConnected);
    const cleanupGlow = installGlassPointerGlow();
    return () => {
      disconnect();
      cleanupGlow();
    };
  }, [loadWorkspace, handleWsEvent, setWsConnected]);

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden text-[var(--ink)]">
      {/* Ambient Liquid Glass Mesh Background */}
      <div className="mesh" aria-hidden="true">
        <i className="b1" />
        <i className="b2" />
        <i className="b3" />
        <i className="b4" />
      </div>

      {/* Top Glass Menubar with Day/Night & Transparency Controls */}
      <TopMenubar
        onSwitchWorkspace={() => setWorkspaceModalOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Main 3-Column Glass Desk */}
      <div className="relative z-[1] flex min-h-0 flex-1 gap-3 p-3">
        <SidebarLeft
          onNewSession={() => setNewSessionOpen(true)}
          onSwitchWorkspace={() => setWorkspaceModalOpen(true)}
        />
        <ChatStage
          onOpenSettings={() => setSettingsOpen(true)}
          onNewSession={() => setNewSessionOpen(true)}
          onOpenDiff={() => setDiffOpen(true)}
        />
        <SidebarRight />
      </div>

      <NewSessionModal open={newSessionOpen} onClose={() => setNewSessionOpen(false)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <WorkspaceModal open={workspaceModalOpen} onClose={() => setWorkspaceModalOpen(false)} />
      <DiffDrawerModal open={diffOpen} onClose={() => setDiffOpen(false)} />
      <FilePreviewModal />
    </div>
  );
}

export default App;
