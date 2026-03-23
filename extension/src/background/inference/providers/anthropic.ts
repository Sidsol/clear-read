import type { ExtensionSettings } from '../../../shared/messaging';
import type { LlmProvider, LlmCallResult } from './provider';
import { parseJsonResponse, estimateTokens } from './provider';

export class AnthropicProvider implements LlmProvider {
  private settings: ExtensionSettings;

  constructor(settings: ExtensionSettings) {
    this.settings = settings;
  }

  async call(
    systemPrompt: string,
    userPrompt: string,
    signal?: AbortSignal,
  ): Promise<LlmCallResult> {
    const model = this.settings.remoteModel || 'claude-haiku-4-5-20251001';

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.settings.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      signal,
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`Anthropic error (${resp.status}): ${errText || resp.statusText}`);
    }

    const data = await resp.json();
    const content =
      data.content?.find((b: { type: string }) => b.type === 'text')?.text ?? '';
    const parsed = parseJsonResponse(content);

    return {
      response: parsed,
      promptTokens: data.usage?.input_tokens ?? estimateTokens(systemPrompt + userPrompt),
      completionTokens: data.usage?.output_tokens ?? estimateTokens(content),
    };
  }

  async isAvailable(): Promise<boolean> {
    return this.settings.apiKey.length > 0;
  }
}
