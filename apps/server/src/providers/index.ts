import { runAnthropicProvider } from './anthropic.js';
import { runGeminiProvider } from './gemini.js';
import { runOpenAICompatProvider } from './openaiCompat.js';
import { runSimulatorProvider } from './simulator.js';
import type { ProviderPromptContext, ProviderStreamCallbacks, ProviderStreamResult } from './types.js';

export async function runAgentProvider(
  ctx: ProviderPromptContext,
  callbacks: ProviderStreamCallbacks
): Promise<ProviderStreamResult> {
  switch (ctx.agent.provider) {
    case 'simulator':
      return runSimulatorProvider(ctx, callbacks);
    case 'gemini':
      return runGeminiProvider(ctx, callbacks);
    case 'anthropic':
      return runAnthropicProvider(ctx, callbacks);
    case 'openai':
      return runOpenAICompatProvider(ctx, callbacks, 'openai');
    case 'ollama':
      return runOpenAICompatProvider(ctx, callbacks, 'ollama');
    default:
      return runSimulatorProvider(ctx, callbacks);
  }
}

export * from './types.js';
