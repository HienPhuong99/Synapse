import { useEffect, useState } from 'react';
import { connectWebSocket } from './lib/api.ts';
import { useSynapseStore } from './store/useSynapseStore.ts';
import { ChatStage } from './components/ChatStage.tsx';
import { DiffDrawerModal } from './components/DiffDrawerModal.tsx';
import { FilePreviewModal } from './components/FilePreviewModal.tsx';
import { NewSessionModal } from './components/NewSessionModal.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { SidebarLeft } from './components/SidebarLeft.tsx';
import { SidebarRight } from './components/SidebarRight.tsx';
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
    return disconnect;
  }, [loadWorkspace, handleWsEvent, setWsConnected]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#141415] text-[#ededed]">
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

      <NewSessionModal open={newSessionOpen} onClose={() => setNewSessionOpen(false)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <WorkspaceModal open={workspaceModalOpen} onClose={() => setWorkspaceModalOpen(false)} />
      <DiffDrawerModal open={diffOpen} onClose={() => setDiffOpen(false)} />
      <FilePreviewModal />
    </div>
  );
}

export default App;
