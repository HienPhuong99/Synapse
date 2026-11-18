import { create } from 'zustand';
import type {
  AgentRuntimeState,
  ChatDocument,
  EphemeralStreamState,
  FileTreeNode,
  InsightsSummary,
  SessionListItem,
  WsServerEvent,
} from '@synapse/shared';
import { api } from '../lib/api.ts';

interface FilePreviewState {
  path: string;
  content: string;
  truncated: boolean;
}

interface SynapseStore {
  wsConnected: boolean;
  workspaceRoot: string;
  sessions: SessionListItem[];
  files: FileTreeNode[];
  activePath: string | null;
  activeDoc: ChatDocument | null;
  insights: InsightsSummary | null;
  lastSyncSource: 'watcher' | 'server' | null;
  orchestratorRunning: boolean;
  turnCount: number;
  orchestratorNotice: string | null;
  agentStates: Record<string, Record<string, { state: AgentRuntimeState; detail?: string }>>;
  streams: Record<string, EphemeralStreamState>;
  splitView: boolean;
  composerText: string;
  filePreview: FilePreviewState | null;
  errorBanner: string | null;

  setWsConnected: (connected: boolean) => void;
  setSplitView: (open: boolean) => void;
  setComposerText: (text: string) => void;
  appendComposerToken: (token: string) => void;
  clearError: () => void;
  closeFilePreview: () => void;

  loadWorkspace: () => Promise<void>;
  switchWorkspace: (workspaceRoot: string) => Promise<void>;
  selectSession: (filePath: string) => Promise<void>;
  openFilePreview: (filePath: string) => Promise<void>;
  handleWsEvent: (event: WsServerEvent) => void;
}

export const useSynapseStore = create<SynapseStore>((set, get) => ({
  wsConnected: false,
  workspaceRoot: '',
  sessions: [],
  files: [],
  activePath: null,
  activeDoc: null,
  insights: null,
  lastSyncSource: null,
  orchestratorRunning: false,
  turnCount: 0,
  orchestratorNotice: null,
  agentStates: {},
  streams: {},
  splitView: false,
  composerText: '',
  filePreview: null,
  errorBanner: null,

  setWsConnected: (wsConnected) => set({ wsConnected }),
  setSplitView: (splitView) => set({ splitView }),
  setComposerText: (composerText) => set({ composerText }),
  appendComposerToken: (token) =>
    set((s) => {
      const sep = s.composerText && !s.composerText.endsWith(' ') && !s.composerText.endsWith('\n') ? ' ' : '';
      return { composerText: `${s.composerText}${sep}${token} ` };
    }),
  clearError: () => set({ errorBanner: null, orchestratorNotice: null }),
  closeFilePreview: () => set({ filePreview: null }),

  loadWorkspace: async () => {
    try {
      const data = await api.getWorkspace();
      set({
        workspaceRoot: data.workspaceRoot,
        sessions: data.sessions,
        files: data.files,
      });

      const current = get().activePath;
      if (!current && data.sessions.length > 0) {
        await get().selectSession(data.sessions[0].filePath);
      } else if (current) {
        await get().selectSession(current);
      }
    } catch (err) {
      set({ errorBanner: err instanceof Error ? err.message : 'Không thể tải workspace.' });
    }
  },

  switchWorkspace: async (workspaceRoot: string) => {
    const data = await api.switchWorkspace(workspaceRoot);
    set({
      workspaceRoot: data.workspaceRoot,
      sessions: data.sessions,
      files: data.files,
      activePath: null,
      activeDoc: null,
      insights: null,
      orchestratorRunning: false,
      turnCount: 0,
      orchestratorNotice: null,
      streams: {},
      errorBanner: null,
    });
    if (data.sessions.length > 0) {
      await get().selectSession(data.sessions[0].filePath);
    }
  },

  selectSession: async (filePath: string) => {
    try {
      const res = await api.getDocument(filePath);
      set({
        activePath: filePath,
        activeDoc: res.document,
        insights: res.insights,
        orchestratorRunning: res.orchestrator.running,
        turnCount: res.orchestrator.turnCount,
        orchestratorNotice: null,
      });
    } catch (err) {
      set({ errorBanner: err instanceof Error ? err.message : 'Không mở được phiên thảo luận.' });
    }
  },

  openFilePreview: async (filePath: string) => {
    try {
      const preview = await api.readFile(filePath);
      set({ filePreview: preview });
    } catch (err) {
      set({ errorBanner: err instanceof Error ? err.message : `Không đọc được file ${filePath}` });
    }
  },

  handleWsEvent: (event) => {
    switch (event.type) {
      case 'sessions:list': {
        set({ sessions: event.sessions });
        break;
      }
      case 'workspace:changed': {
        set({
          workspaceRoot: event.workspaceRoot,
          sessions: event.sessions,
          files: event.files,
          activePath: null,
          activeDoc: null,
          insights: null,
          streams: {},
        });
        if (event.sessions.length > 0) {
          void get().selectSession(event.sessions[0].filePath);
        }
        break;
      }
      case 'session:updated': {
        const activePath = get().activePath;
        if (activePath === event.document.filePath) {
          set({
            activeDoc: event.document,
            insights: event.insights,
            lastSyncSource: event.source,
          });
        }
        break;
      }
      case 'session:removed': {
        const { activePath, sessions } = get();
        const remaining = sessions.filter((s) => s.filePath !== event.filePath);
        set({ sessions: remaining });
        if (activePath === event.filePath) {
          set({ activePath: null, activeDoc: null, insights: null });
          if (remaining.length > 0) {
            void get().selectSession(remaining[0].filePath);
          }
        }
        break;
      }
      case 'agent:state': {
        set((s) => ({
          agentStates: {
            ...s.agentStates,
            [event.filePath]: {
              ...(s.agentStates[event.filePath] ?? {}),
              [event.agentId]: { state: event.state, detail: event.detail },
            },
          },
        }));
        break;
      }
      case 'stream:start': {
        set((s) => ({
          streams: {
            ...s.streams,
            [event.stream.filePath]: event.stream,
          },
        }));
        break;
      }
      case 'stream:delta': {
        set((s) => {
          const existing = s.streams[event.filePath];
          if (!existing || existing.messageId !== event.messageId) return s;
          return {
            streams: {
              ...s.streams,
              [event.filePath]: {
                ...existing,
                thinking: existing.thinking + (event.deltaThinking ?? ''),
                content: existing.content + (event.deltaContent ?? ''),
              },
            },
          };
        });
        break;
      }
      case 'stream:end': {
        set((s) => {
          const copy = { ...s.streams };
          delete copy[event.filePath];
          return {
            streams: copy,
            errorBanner: event.status === 'error' && event.error ? event.error : s.errorBanner,
          };
        });
        break;
      }
      case 'orchestrator:status': {
        if (get().activePath === event.filePath) {
          set({
            orchestratorRunning: event.running,
            turnCount: event.turnCount,
            orchestratorNotice: event.reason && !event.running ? event.reason : null,
          });
        }
        break;
      }
    }
  },
}));
