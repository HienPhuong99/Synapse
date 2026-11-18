import type { AgentConfig, ChatDocument, ProviderSettings } from '@synapse/shared';

export interface ProviderPromptContext {
  agent: AgentConfig;
  document: ChatDocument;
  fileExcerpts: { path: string; content: string }[];
  settings: ProviderSettings;
  signal: AbortSignal;
  /** Workspace root; CLI providers run there. */
  cwd: string;
}

export interface CliActivity {
  tool: string;
  path?: string;
  command?: string;
  detail?: string;
}

export interface ProviderStreamCallbacks {
  onThinkingDelta: (delta: string) => void;
  onContentDelta: (delta: string) => void;
  /** Tool use by CLI agents (e.g. "Bash npm test"), for presence. */
  onActivity?: (activity: CliActivity) => void;
}

export interface ProviderStreamResult {
  thinking: string;
  content: string;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
}
