import type { AgentConfig, ChatDocument, ProviderSettings } from '@synapse/shared';

export interface ProviderPromptContext {
  agent: AgentConfig;
  document: ChatDocument;
  fileExcerpts: { path: string; content: string }[];
  settings: ProviderSettings;
  signal: AbortSignal;
}

export interface ProviderStreamCallbacks {
  onThinkingDelta: (delta: string) => void;
  onContentDelta: (delta: string) => void;
}

export interface ProviderStreamResult {
  thinking: string;
  content: string;
  tokensIn?: number;
  tokensOut?: number;
}
