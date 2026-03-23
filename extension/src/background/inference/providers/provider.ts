import type { ExtensionSettings } from '../../../shared/messaging';
import { OllamaProvider } from './ollama';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { GeminiProvider } from './gemini';
import { ChromeAIProvider } from './chrome-ai';

/** Shape of a single detection in the LLM JSON response */
export interface LlmDetection {
  technique: string;
  snippet: string;
  explanation: string;
  confidence: string;
  trigger_phrases?: string[];
  argument_map?: {
    conclusion: string;
    premises: Array<{ text: string; type: string; issue?: string }>;
    logical_gaps: string[];
    missing_evidence: string[];
    steelman: string;
  };
}

/** Shape of the full LLM JSON response */
export interface LlmResponse {
  detections: LlmDetection[];
  overall_assessment: string;
}

/** Result from a provider call, including parsed response and token usage */
export interface LlmCallResult {
  response: LlmResponse;
  promptTokens: number;
  completionTokens: number;
}

/**
 * Interface that each LLM provider must implement.
 */
export interface LlmProvider {
  call(
    systemPrompt: string,
    userPrompt: string,
    signal?: AbortSignal,
  ): Promise<LlmCallResult>;

  /** Stream tokens and call onToken with accumulated content. Returns final result. */
  callStreaming?(
    systemPrompt: string,
    userPrompt: string,
    onToken: (accumulated: string) => void,
    signal?: AbortSignal,
  ): Promise<LlmCallResult>;

  isAvailable(): Promise<boolean>;
}

/**
 * Parse a JSON response from the LLM, handling common issues:
 * - Markdown code fences
 * - Leading/trailing whitespace
 * - Partial or malformed JSON
 */
export function parseJsonResponse(content: string): LlmResponse {
  let cleaned = content.trim();

  // Strip markdown code fences
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/, '');
  cleaned = cleaned.trim();

  // Try to find JSON object boundaries if there's extra text
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  try {
    const parsed = JSON.parse(cleaned);

    // Standard schema: { detections: [...], overall_assessment: "..." }
    if (Array.isArray(parsed.detections)) {
      return {
        detections: parsed.detections.filter((d: any) => d && typeof d === 'object'),
        overall_assessment: parsed.overall_assessment ?? '',
      };
    }

    // Non-standard: model returned an object without a detections array.
    // Try to extract detection-like structures from any shape of JSON.
    const detections: LlmDetection[] = [];
    let assessment = '';

    function extractFromValue(val: any): void {
      if (!val || typeof val !== 'object') return;
      if (Array.isArray(val)) {
        for (const item of val) extractFromValue(item);
        return;
      }
      // Check if this object looks like a detection (has technique/type/fallacy name + explanation)
      const technique = val.technique ?? val.Type ?? val['Type of Fallacy']
        ?? val.fallacy ?? val.Fallacy ?? val.type ?? val.name ?? val.Name ?? '';
      const explanation = val.explanation ?? val.Explanation ?? val.Description
        ?? val.description ?? val.reason ?? val.Reason ?? '';
      if (technique && explanation) {
        detections.push({
          technique: String(technique),
          snippet: val.snippet ?? val.Snippet ?? val.quote ?? val.Quote ?? val.text ?? val.Text ?? '',
          explanation: String(explanation),
          confidence: val.confidence ?? val.Confidence ?? 'medium',
          trigger_phrases: val.trigger_phrases ?? val.triggers ?? [],
          argument_map: val.argument_map ?? val.argumentMap ?? undefined,
        });
        return;
      }
      // Check for assessment
      if (val.overall_assessment) assessment = val.overall_assessment;
      if (val.assessment) assessment = val.assessment;
      if (val.summary) assessment = val.summary;
      // Recurse into nested objects
      for (const child of Object.values(val)) {
        extractFromValue(child);
      }
    }

    extractFromValue(parsed);

    if (detections.length > 0 || assessment) {
      console.log(`[ClearRead] Parsed non-standard JSON: found ${detections.length} detection(s)`);
      return { detections, overall_assessment: assessment };
    }

    // Couldn't extract anything useful
    console.warn('[ClearRead] JSON parsed but no detections found:', cleaned.slice(0, 200));
    return {
      detections: [],
      overall_assessment: '',
    };
  } catch {
    console.warn('[ClearRead] Failed to parse LLM JSON response:', cleaned.slice(0, 200));
    return {
      detections: [],
      overall_assessment: 'Analysis could not be parsed. The LLM response was not valid JSON.',
    };
  }
}

/**
 * Rough token count estimate (~4 chars per token for English text).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Create the appropriate LlmProvider for the given settings.
 */
export function createProvider(settings: ExtensionSettings): LlmProvider {
  switch (settings.remoteProvider) {
    case 'ollama':
      return new OllamaProvider(settings);
    case 'openai':
      return new OpenAIProvider(settings);
    case 'anthropic':
      return new AnthropicProvider(settings);
    case 'gemini':
      return new GeminiProvider(settings);
    case 'chrome_ai':
      return new ChromeAIProvider();
    default:
      throw new Error(`Unknown provider: ${settings.remoteProvider}`);
  }
}
