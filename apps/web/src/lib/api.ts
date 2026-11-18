import type {
  AgentConfig,
  ChatDocument,
  FileTreeNode,
  GitDiffPayload,
  InsightsSummary,
  OrchestrationMode,
  ProviderSettings,
  SessionListItem,
  WsServerEvent,
} from '@synapse/shared';

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export const api = {
  getWorkspace: () =>
    requestJson<{ workspaceRoot: string; sessions: SessionListItem[]; files: FileTreeNode[] }>('/api/workspace'),

  switchWorkspace: (workspaceRoot: string) =>
    requestJson<{ workspaceRoot: string; sessions: SessionListItem[]; files: FileTreeNode[] }>(
      '/api/workspace/switch',
      {
        method: 'POST',
        body: JSON.stringify({ workspaceRoot }),
      }
    ),

  getDocument: (filePath: string) =>
    requestJson<{
      document: ChatDocument;
      insights: InsightsSummary;
      orchestrator: { running: boolean; turnCount: number };
    }>(`/api/sessions/doc?path=${encodeURIComponent(filePath)}`),

  createSession: (payload: {
    fileName: string;
    title: string;
    mode: OrchestrationMode;
    max_turns: number;
    max_cost_usd?: number;
    agents: AgentConfig[];
    initialPrompt?: string;
  }) =>
    requestJson<{ document: ChatDocument; insights: InsightsSummary }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  saveRaw: (path: string, raw: string) =>
    requestJson<{ document: ChatDocument; insights: InsightsSummary }>('/api/sessions/raw', {
      method: 'PUT',
      body: JSON.stringify({ path, raw }),
    }),

  postMessage: (path: string, content: string, autoRun: boolean) =>
    requestJson<{ document: ChatDocument; insights: InsightsSummary }>('/api/sessions/messages', {
      method: 'POST',
      body: JSON.stringify({ path, content, author: 'human', autoRun }),
    }),

  editMessage: (path: string, messageId: string, content: string) =>
    requestJson<{ document: ChatDocument; insights: InsightsSummary }>('/api/sessions/messages', {
      method: 'PATCH',
      body: JSON.stringify({ path, messageId, content }),
    }),

  branchFromMessage: (path: string, messageId: string) =>
    requestJson<{ document: ChatDocument; insights: InsightsSummary }>('/api/sessions/branch', {
      method: 'POST',
      body: JSON.stringify({ path, messageId }),
    }),

  rerunFromMessage: (path: string, messageId: string) =>
    requestJson<{ document: ChatDocument; insights: InsightsSummary }>('/api/sessions/rerun', {
      method: 'POST',
      body: JSON.stringify({ path, messageId }),
    }),

  controlSession: (path: string, action: 'start' | 'pause' | 'step' | 'council', agentId?: string) =>
    requestJson<{ ok: boolean; status: { running: boolean; turnCount: number } }>('/api/sessions/control', {
      method: 'POST',
      body: JSON.stringify({ path, action, agentId }),
    }),

  getGitDiff: () => requestJson<GitDiffPayload>('/api/git/diff'),

  triggerDiffReview: (path: string, reviewerId?: string) =>
    requestJson<{ ok: boolean; status: { running: boolean; turnCount: number } }>('/api/sessions/review', {
      method: 'POST',
      body: JSON.stringify({ path, reviewerId }),
    }),

  compactSession: (path: string, keepLatest = 2) =>
    requestJson<{
      ok: boolean;
      archivedCount: number;
      archivePath?: string;
      document: ChatDocument;
      insights: InsightsSummary;
    }>('/api/sessions/compact', {
      method: 'POST',
      body: JSON.stringify({ path, keepLatest }),
    }),

  readFile: (path: string) =>
    requestJson<{ path: string; content: string; truncated: boolean }>(
      `/api/file?path=${encodeURIComponent(path)}`
    ),

  getSettings: () => requestJson<ProviderSettings>('/api/settings'),

  saveSettings: (settings: ProviderSettings) =>
    requestJson<ProviderSettings>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
};

export function connectWebSocket(onEvent: (event: WsServerEvent) => void, onStatus: (connected: boolean) => void): () => void {
  let ws: WebSocket | null = null;
  let closedByUser = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;
    ws = new WebSocket(url);

    ws.onopen = () => onStatus(true);

    ws.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.data)) as WsServerEvent;
        onEvent(parsed);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      onStatus(false);
      if (!closedByUser) {
        reconnectTimer = setTimeout(connect, 1500);
      }
    };

    ws.onerror = () => {
      ws?.close();
    };
  };

  connect();

  return () => {
    closedByUser = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    ws?.close();
  };
}
