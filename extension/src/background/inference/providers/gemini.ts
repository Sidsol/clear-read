import type { ExtensionSettings } from '../../../shared/messaging';
import type { LlmProvider, LlmCallResult } from './provider';
import { parseJsonResponse, estimateTokens } from './provider';

export class GeminiProvider implements LlmProvider {
  private settings: ExtensionSettings;

  constructor(settings: ExtensionSettings) {
    this.settings = settings;
  }

  async call(
    systemPrompt: string,
    userPrompt: string,
    signal?: AbortSignal,
  ): Promise<LlmCallResult> {
    const model = this.settings.remoteModel || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.settings.apiKey}`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`Gemini error (${resp.status}): ${errText || resp.statusText}`);
    }

    const data = await resp.json();
    const content =
      data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const parsed = parseJsonResponse(content);

    const usage = data.usageMetadata ?? {};
    return {
      response: parsed,
      promptTokens: usage.promptTokenCount ?? estimateTokens(systemPrompt + userPrompt),
      completionTokens: usage.candidatesTokenCount ?? estimateTokens(content),
    };
  }

  async isAvailable(): Promise<boolean> {
    return this.settings.apiKey.length > 0;
  }
}
