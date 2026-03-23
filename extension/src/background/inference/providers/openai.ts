import type { ExtensionSettings } from '../../../shared/messaging';
import type { LlmProvider, LlmCallResult } from './provider';
import { parseJsonResponse, estimateTokens } from './provider';

export class OpenAIProvider implements LlmProvider {
  private settings: ExtensionSettings;

  constructor(settings: ExtensionSettings) {
    this.settings = settings;
  }

  async call(
    systemPrompt: string,
    userPrompt: string,
    signal?: AbortSignal,
  ): Promise<LlmCallResult> {
    const model = this.settings.remoteModel || 'gpt-5.4-nano-2026-03-17';

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.settings.apiKey}`,
      },
      signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`OpenAI error (${resp.status}): ${errText || resp.statusText}`);
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    const parsed = parseJsonResponse(content);

    return {
      response: parsed,
      promptTokens: data.usage?.prompt_tokens ?? estimateTokens(systemPrompt + userPrompt),
      completionTokens: data.usage?.completion_tokens ?? estimateTokens(content),
    };
  }

  async isAvailable(): Promise<boolean> {
    return this.settings.apiKey.length > 0;
  }
}
