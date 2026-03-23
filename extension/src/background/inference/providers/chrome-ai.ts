import type { LlmProvider, LlmCallResult } from './provider';
import { parseJsonResponse, estimateTokens } from './provider';

/**
 * Browser built-in AI provider using the Prompt API.
 * - Chrome 131+: Gemini Nano on-device (enable "Prompt API for Gemini Nano" in chrome://flags)
 * - Edge 142+: Phi Silica on-device (enable via edge://flags)
 * Runs entirely on-device — no API key, no network, no setup required.
 *
 * API surface (service worker context):
 *   self.ai.languageModel.capabilities() → { available: 'readily' | 'after-download' | 'no' }
 *   self.ai.languageModel.create({ systemPrompt }) → session
 *   session.prompt(text, { signal }) → string
 *   session.destroy()
 */
export class ChromeAIProvider implements LlmProvider {
  async call(
    systemPrompt: string,
    userPrompt: string,
    signal?: AbortSignal,
  ): Promise<LlmCallResult> {
    const ai = (globalThis as any).ai;
    if (!ai?.languageModel) {
      throw new Error(
        'Browser built-in AI API not found (self.ai.languageModel is undefined). '
        + 'In Chrome: enable both "Prompt API for Gemini Nano" and "Optimization Guide On Device Model" in chrome://flags, then restart. '
        + 'In Edge: enable the Prompt API in edge://flags, then restart. '
        + 'After restarting, the model may take several minutes to download in the background.'
      );
    }

    // Check capabilities before creating session
    const capabilities = await ai.languageModel.capabilities();
    if (capabilities.available === 'no') {
      throw new Error('Built-in AI model is not supported on this device.');
    }
    if (capabilities.available === 'after-download') {
      throw new Error(
        'Built-in AI model is still downloading. This happens in the background after enabling the flags and restarting the browser. '
        + 'Please wait a few minutes and try again. You can check download progress at chrome://components (look for "Optimization Guide On Device Model").'
      );
    }

    const session = await ai.languageModel.create({
      systemPrompt,
    });

    try {
      signal?.throwIfAborted();

      const content = await session.prompt(userPrompt, { signal });
      const parsed = parseJsonResponse(content);

      return {
        response: parsed,
        promptTokens: estimateTokens(systemPrompt + userPrompt),
        completionTokens: estimateTokens(content),
      };
    } finally {
      session.destroy();
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const ai = (globalThis as any).ai;
      if (!ai?.languageModel) return false;
      const capabilities = await ai.languageModel.capabilities();
      return capabilities.available === 'readily';
    } catch {
      return false;
    }
  }
}
