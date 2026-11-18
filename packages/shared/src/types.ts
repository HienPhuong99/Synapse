export type ProviderKind = 'simulator' | 'gemini' | 'anthropic' | 'openai' | 'ollama' | 'claude-code' | 'gemini-cli';

export type OrchestrationMode = 'manual' | 'mention' | 'round_robin' | 'mention_and_round_robin';

export type SessionStatus = 'idle' | 'running' | 'paused' | 'completed';

export type AgentRuntimeState = 'idle' | 'thinking' | 'streaming' | 'waiting' | 'error';

export type PresenceStatus =
  | 'offline'
  | 'idle'
  | 'thinking'
  | 'working'
  | 'typing'
  | 'needs_approval'
  | 'error';

export interface AgentPresence {
  agentId: string;
  status: PresenceStatus;
  detail?: string;
  tool?: string;
  path?: string;
  workspaceRoot?: string;
  since: string;
  lastSeenAt: string;
  seenMessageId?: string;
  /** Session file of seenMessageId (ids like msg_01 repeat across files). */
  seenFile?: string;
  seenAt?: string;
  eta?: string;
}

export interface PresenceIngestPayload {
  agent: string;
  source?: 'claude-hook' | 'antigravity-hook' | 'api' | 'cli';
  event: string;
  tool?: string;
  path?: string;
  command?: string;
  detail?: string;
  workspaceRoot?: string;
  eta?: string;
}

export interface AgentConfig {
  id: string;
  name: string;
  role?: string;
  provider: ProviderKind;
  model: string;
  color: string;
  system_prompt?: string;
}

export interface ChatSessionMeta {
  schema: string;
  title: string;
  project_root?: string;
  mode: OrchestrationMode;
  max_turns: number;
  status: SessionStatus;
  agents: AgentConfig[];
  [key: string]: unknown;
}

export interface MessageMeta {
  id: string;
  model?: string;
  provider?: ProviderKind;
  status?: 'done' | 'streaming' | 'stopped' | 'error';
  tokens_in?: number;
  tokens_out?: number;
  duration_ms?: number;
  refs?: string[];
  error?: string;
  headingSuffix?: string;
  target?: string;
}

export interface ChatMessage {
  id: string;
  author: string; // e.g. "human", "architect", "reviewer"
  timestamp: string;
  thinking?: string;
  content: string;
  meta?: MessageMeta;
  mentions: string[];
  fileRefs: string[];
}

export interface ChatDocument {
  filePath: string; // workspace-relative path using forward slashes
  raw: string;
  meta: ChatSessionMeta;
  preamble: string;
  messages: ChatMessage[];
}

export interface SessionListItem {
  filePath: string;
  title: string;
  status: SessionStatus;
  mode: OrchestrationMode;
  messageCount: number;
  agentCount: number;
  updatedAt: string;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: FileTreeNode[];
}

export interface ActionItem {
  id: string;
  text: string;
  done: boolean;
  author: string;
  messageId: string;
}

export interface DecisionItem {
  id: string;
  text: string;
  author: string;
  messageId: string;
}

export interface InsightsSummary {
  decisions: DecisionItem[];
  actionItems: ActionItem[];
  referencedFiles: string[];
  totalTokensIn: number;
  totalTokensOut: number;
}

export interface ProviderSettings {
  geminiApiKey?: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  ollamaBaseUrl?: string;
}

export interface EphemeralStreamState {
  filePath: string;
  messageId: string;
  author: string;
  model: string;
  provider: ProviderKind;
  thinking: string;
  content: string;
  startedAt: string;
}

export type WsServerEvent =
  | { type: 'sessions:list'; sessions: SessionListItem[] }
  | {
      type: 'workspace:changed';
      workspaceRoot: string;
      sessions: SessionListItem[];
      files: FileTreeNode[];
    }
  | { type: 'session:updated'; document: ChatDocument; insights: InsightsSummary; source: 'watcher' | 'server' }
  | { type: 'session:removed'; filePath: string }
  | { type: 'agent:state'; filePath: string; agentId: string; state: AgentRuntimeState; detail?: string }
  | { type: 'stream:start'; stream: EphemeralStreamState }
  | { type: 'stream:delta'; filePath: string; messageId: string; deltaContent?: string; deltaThinking?: string }
  | { type: 'stream:end'; filePath: string; messageId: string; status: 'done' | 'stopped' | 'error'; error?: string }
  | { type: 'orchestrator:status'; filePath: string; running: boolean; turnCount: number; reason?: string }
  | { type: 'presence:snapshot'; presences: AgentPresence[] }
  | { type: 'presence:update'; presence: AgentPresence }
  | { type: 'presence:alert'; agentId: string; title: string; body: string };
