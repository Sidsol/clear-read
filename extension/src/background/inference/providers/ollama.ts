import type { ExtensionSettings } from '../../../shared/messaging';
import type { LlmProvider, LlmCallResult } from './provider';
import { parseJsonResponse, estimateTokens } from './provider';

export class OllamaProvider implements LlmProvider {
  private settings: ExtensionSettings;

  constructor(settings: ExtensionSettings) {
    this.settings = settings;
  }

  async call(
    systemPrompt: string,
    userPrompt: string,
    signal?: AbortSignal,
  ): Promise<LlmCallResult> {
    const model = this.settings.ollamaModel || 'llama3.1:8b';
    const url = `${this.settings.ollamaUrl}/api/chat`;
    const body = JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: false,
      format: 'json',
      options: {
        num_ctx: this.settings.ollamaContextSize || 8192,
      },
    });

    // Retry up to 3 times on 500 errors with exponential backoff
    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [2000, 5000, 10000]; // 2s, 5s, 10s
    let lastError = '';

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      signal?.throwIfAborted();

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body,
      });

      if (resp.ok) {
        const data = await resp.json();
        const content = data.message?.content ?? data.response ?? '';
        const parsed = parseJsonResponse(content);

        return {
          response: parsed,
          promptTokens: data.prompt_eval_count ?? estimateTokens(systemPrompt + userPrompt),
          completionTokens: data.eval_count ?? estimateTokens(content),
        };
      }

      const errText = await resp.text().catch(() => '');
      console.error(`[ClearRead] Ollama ${resp.status} error (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`, errText || '(empty body)');

      // Parse specific error causes — don't retry on these
      const lower = errText.toLowerCase();
      if (lower.includes('out of memory') || lower.includes('oom') || lower.includes('alloc')) {
        throw new Error(`Ollama ran out of memory (${resp.status}). Try reducing the context size in settings, or use a smaller model.`);
      }
      if (lower.includes('context length') || lower.includes('too long')) {
        throw new Error(`Text exceeded the model's context limit (${resp.status}). Try reducing the context size setting or analyzing a shorter selection.`);
      }

      lastError = errText.slice(0, 300) || resp.statusText;

      // On 500, wait with exponential backoff and retry
      if (resp.status === 500 && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attempt] ?? 10000;
        console.log(`[ClearRead] Retrying Ollama request in ${delay / 1000}s (attempt ${attempt + 2}/${MAX_RETRIES + 1})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw new Error(`Ollama error (${resp.status}) after ${attempt + 1} attempt(s): ${lastError}`);
    }

    throw new Error(`Ollama error after ${MAX_RETRIES + 1} attempts: ${lastError}`);
  }

  async isAvailable(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.settings.ollamaUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  async callStreaming(
    systemPrompt: string,
    userPrompt: string,
    onToken: (accumulated: string) => void,
    signal?: AbortSignal,
  ): Promise<LlmCallResult> {
    const model = this.settings.ollamaModel || 'llama3.1:8b';
    const url = `${this.settings.ollamaUrl}/api/chat`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: true,
        format: 'json',
        options: {
          num_ctx: this.settings.ollamaContextSize || 8192,
        },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`Ollama error (${resp.status}): ${errText.slice(0, 300) || resp.statusText}`);
    }

    const reader = resp.body?.getReader();
    if (!reader) throw new Error('Ollama response has no readable body');

    const decoder = new TextDecoder();
    let accumulated = '';
    let promptTokens = 0;
    let completionTokens = 0;

    try {
      while (true) {
        signal?.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        // Ollama streams newline-delimited JSON objects
        for (const line of text.split('\n')) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            const token = chunk.message?.content ?? '';
            accumulated += token;
            onToken(accumulated);

            // Capture token counts from the final chunk
            if (chunk.done) {
              promptTokens = chunk.prompt_eval_count ?? estimateTokens(systemPrompt + userPrompt);
              completionTokens = chunk.eval_count ?? estimateTokens(accumulated);
            }
          } catch {
            // Partial JSON line, skip
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const parsed = parseJsonResponse(accumulated);
    return {
      response: parsed,
      promptTokens: promptTokens || estimateTokens(systemPrompt + userPrompt),
      completionTokens: completionTokens || estimateTokens(accumulated),
    };
  }
}
