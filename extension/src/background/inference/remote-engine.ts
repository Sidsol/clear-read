/**
 * ClearRead Remote Engine
 *
 * Orchestrates LLM-powered rhetorical analysis. Delegates actual API
 * calls to provider implementations (Ollama, OpenAI, Anthropic, Gemini)
 * and handles chunking, response mapping, and fuzzy snippet matching.
 */

import type {
  InferenceEngine,
  AnalysisResult,
  SegmentAnalysis,
  FallacyType,
  FallacyDetection,
  TokenAttribution,
  ArgumentMap,
} from './types';
import type { ExtensionSettings } from '../../shared/messaging';
import { FALLACY_DEFINITIONS } from '../../shared/constants';
import { buildSystemPrompt, buildUserPrompt, TECHNIQUE_NAME_MAP } from './prompts';
import type { LlmProvider, LlmResponse } from './providers/provider';
import { createProvider } from './providers/provider';

/** Estimate system prompt size in tokens (~4 chars per token) */
const SYSTEM_PROMPT_TOKENS = Math.ceil(buildSystemPrompt().length / 4);

/** Reserve tokens for the LLM response */
const RESPONSE_RESERVE_TOKENS = 1500;

/** Confidence level to numeric score mapping */
const CONFIDENCE_MAP: Record<string, number> = {
  high: 0.85,
  medium: 0.6,
  low: 0.35,
};

export class RemoteEngine implements InferenceEngine {
  private settings: ExtensionSettings;
  private provider: LlmProvider | null = null;

  constructor(settings: ExtensionSettings) {
    this.settings = settings;
  }

  private getProvider(): LlmProvider {
    if (!this.provider) {
      this.provider = createProvider(this.settings);
    }
    return this.provider;
  }

  async analyze(
    text: string,
    signal?: AbortSignal,
    onProgress?: (partial: Partial<AnalysisResult>) => void,
  ): Promise<AnalysisResult> {
    const provider = this.getProvider();

    // Calculate chunk size based on the model's context window
    const contextTokens = this.settings.remoteProvider === 'ollama'
      ? (this.settings.ollamaContextSize || 8192)
      : this.settings.remoteProvider === 'chrome_ai'
        ? 4096  // Gemini Nano has a small context window
        : 128000;
    const availableTokens = Math.max(500, contextTokens - SYSTEM_PROMPT_TOKENS - RESPONSE_RESERVE_TOKENS);
    const chunkSize = availableTokens * 4;
    const chunks = splitIntoChunks(text, chunkSize);
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    const allSegments: SegmentAnalysis[] = [];
    const allAssessments: string[] = [];

    // Use compact prompt for Chrome AI (Gemini Nano has limited context)
    const useCompact = this.settings.remoteProvider === 'chrome_ai';
    const systemPrompt = buildSystemPrompt(useCompact);

    for (const chunk of chunks) {
      signal?.throwIfAborted();
      try {
        const userPrompt = buildUserPrompt(chunk);
        let callResult: { response: LlmResponse; promptTokens: number; completionTokens: number };

        // Use streaming if the provider supports it and we have a progress callback
        if (onProgress && provider.callStreaming) {
          let lastDetectionCount = 0;
          callResult = await provider.callStreaming(
            systemPrompt,
            userPrompt,
            (accumulated) => {
              // Try to parse partial JSON to extract complete detections
              try {
                const partial = parsePartialDetections(accumulated);
                if (partial.length > lastDetectionCount) {
                  lastDetectionCount = partial.length;
                  const partialSegments = partial.map(det => {
                    const matchedSnippet = fuzzyMatchSnippet(det.snippet || '', chunk);
                    const fallacyType = mapTechniqueToType(det.technique || '');
                    const confidence = CONFIDENCE_MAP[det.confidence?.toLowerCase()] ?? CONFIDENCE_MAP.medium;
                    const fallacy: FallacyDetection = {
                      type: fallacyType,
                      confidence,
                      explanation: det.explanation || getFallbackExplanation(fallacyType),
                    };
                    if (fallacyType === 'other') fallacy.llmLabel = det.technique;
                    if (det.argument_map) {
                      const am = det.argument_map;
                      fallacy.argumentMap = {
                        conclusion: am.conclusion || '',
                        premises: (am.premises || []).map((p: any) => ({
                          text: p.text || '',
                          type: (['supporting', 'irrelevant', 'weak', 'unsupported'].includes(p.type) ? p.type : 'weak') as 'supporting' | 'irrelevant' | 'weak' | 'unsupported',
                          issue: p.issue,
                        })),
                        logicalGaps: am.logical_gaps || [],
                        missingEvidence: am.missing_evidence || [],
                        steelman: am.steelman || '',
                      };
                    }
                    return {
                      text: matchedSnippet || det.snippet || '',
                      fallacies: [fallacy],
                      highlightTokens: det.trigger_phrases?.map((p: string, i: number) => ({
                        token: p,
                        score: Math.max(0.3, 1.0 - i * 0.15),
                      })),
                    } as SegmentAnalysis;
                  });
                  onProgress({
                    segments: [...allSegments, ...partialSegments],
                    overallAssessment: 'Analyzing...',
                  });
                }
              } catch {
                // Partial JSON not parseable yet, that's fine
              }
            },
            signal,
          );
        } else {
          callResult = await provider.call(systemPrompt, userPrompt, signal);
        }

        const { response, promptTokens, completionTokens } = callResult;
        totalPromptTokens += promptTokens;
        totalCompletionTokens += completionTokens;

        const segments = this.mapResponseToSegments(response, chunk);
        allSegments.push(...segments);

        if (response.overall_assessment) {
          allAssessments.push(response.overall_assessment);
        }
      } catch (err) {
        if (signal?.aborted) throw err;
        console.error(`[ClearRead] Chunk analysis failed: ${err}`);
        if (chunks.length === 1 || allSegments.length === 0) throw err;
      }
    }

    const totalFallacies = allSegments.reduce(
      (sum, seg) => sum + seg.fallacies.length, 0,
    );

    let overallAssessment: string;
    if (allAssessments.length === 1) {
      overallAssessment = allAssessments[0];
    } else if (totalFallacies === 0) {
      overallAssessment =
        'No significant rhetorical concerns were detected in this text. As always, consider consulting multiple sources for important claims.';
    } else {
      overallAssessment = `This text contains ${totalFallacies} passage(s) that may use rhetorical techniques worth examining. ${allAssessments[0] ?? 'Review the highlighted sections for more detail.'}`;
    }

    return {
      segments: allSegments,
      overallAssessment,
      timestamp: Date.now(),
      source: 'remote',
      tokenUsage: {
        prompt: totalPromptTokens,
        completion: totalCompletionTokens,
      },
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      const provider = this.getProvider();
      return provider.isAvailable();
    } catch {
      return false;
    }
  }

  // ─── Response Mapping ────────────────────────────────────────────

  private mapResponseToSegments(
    response: LlmResponse,
    originalText: string,
  ): SegmentAnalysis[] {
    if (!response.detections || response.detections.length === 0) {
      return [{ text: originalText, fallacies: [] }];
    }

    return response.detections
      .filter((detection) => detection && detection.snippet)
      .map((detection) => {
        const matchedSnippet = fuzzyMatchSnippet(detection.snippet, originalText);
        const segmentText = matchedSnippet || detection.snippet;
        const fallacyType = mapTechniqueToType(detection.technique);
        const confidence =
          CONFIDENCE_MAP[detection.confidence?.toLowerCase()] ?? CONFIDENCE_MAP.medium;

        const fallacy: FallacyDetection = {
          type: fallacyType,
          confidence,
          explanation: detection.explanation || getFallbackExplanation(fallacyType),
        };

        if (fallacyType === 'other') {
          fallacy.llmLabel = detection.technique;
        }

        // Map argument structure if provided by the LLM
        if (detection.argument_map) {
          const am = detection.argument_map;
          fallacy.argumentMap = {
            conclusion: am.conclusion || '',
            premises: (am.premises || []).map(p => ({
              text: p.text || '',
              type: (['supporting', 'irrelevant', 'weak', 'unsupported'].includes(p.type) ? p.type : 'weak') as 'supporting' | 'irrelevant' | 'weak' | 'unsupported',
              issue: p.issue,
            })),
            logicalGaps: am.logical_gaps || [],
            missingEvidence: am.missing_evidence || [],
            steelman: am.steelman || '',
          };
        }

        let highlightTokens: TokenAttribution[] | undefined;
        if (detection.trigger_phrases && detection.trigger_phrases.length > 0) {
          highlightTokens = detection.trigger_phrases.map((phrase, i) => ({
            token: phrase,
            score: Math.max(0.3, 1.0 - i * 0.15),
          }));
        }

        return { text: segmentText, fallacies: [fallacy], highlightTokens };
      });
  }
}

// ─── Utility Functions ───────────────────────────────────────────────

function splitIntoChunks(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining);
      break;
    }

    let splitAt = maxChars;
    const searchRegion = remaining.slice(0, maxChars);
    const lastSentenceEnd = Math.max(
      searchRegion.lastIndexOf('. '),
      searchRegion.lastIndexOf('! '),
      searchRegion.lastIndexOf('? '),
    );

    if (lastSentenceEnd > maxChars * 0.5) {
      splitAt = lastSentenceEnd + 2;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }

  return chunks;
}

function fuzzyMatchSnippet(snippet: string, originalText: string): string | null {
  if (!snippet || !originalText) return null;

  const exactIdx = originalText.indexOf(snippet);
  if (exactIdx !== -1) {
    return originalText.slice(exactIdx, exactIdx + snippet.length);
  }

  const normalizeWs = (s: string) => s.replace(/\s+/g, ' ').trim();
  const normalizedSnippet = normalizeWs(snippet);
  const normalizedOriginal = normalizeWs(originalText);

  const normIdx = normalizedOriginal.indexOf(normalizedSnippet);
  if (normIdx !== -1) {
    return findOriginalSubstring(originalText, normalizedSnippet);
  }

  const lowerSnippet = normalizedSnippet.toLowerCase();
  const lowerOriginal = normalizedOriginal.toLowerCase();
  const ciIdx = lowerOriginal.indexOf(lowerSnippet);
  if (ciIdx !== -1) {
    return findOriginalSubstring(originalText, normalizedSnippet, true);
  }

  if (normalizedSnippet.length > 20) {
    const partialSearch = lowerSnippet.slice(0, 60);
    const partialIdx = lowerOriginal.indexOf(partialSearch);
    if (partialIdx !== -1) {
      const endSearch = lowerSnippet.slice(-30);
      const endIdx = lowerOriginal.indexOf(endSearch, partialIdx);
      if (endIdx !== -1) {
        return findOriginalSubstring(
          originalText,
          normalizedOriginal.slice(partialIdx, endIdx + endSearch.length),
          true,
        );
      }
    }
  }

  return null;
}

function findOriginalSubstring(
  original: string,
  normalized: string,
  caseInsensitive = false,
): string | null {
  const compare = caseInsensitive
    ? (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
    : (a: string, b: string) => a === b;

  const normalizedWords = normalized.split(' ');
  if (normalizedWords.length === 0) return null;

  const firstWord = normalizedWords[0];
  let searchFrom = 0;

  while (searchFrom < original.length) {
    const idx = caseInsensitive
      ? original.toLowerCase().indexOf(firstWord.toLowerCase(), searchFrom)
      : original.indexOf(firstWord, searchFrom);

    if (idx === -1) return null;

    let pos = idx;
    let matched = true;

    for (const word of normalizedWords) {
      while (pos < original.length && /\s/.test(original[pos])) pos++;
      const candidate = original.slice(pos, pos + word.length);
      if (!compare(candidate, word)) {
        matched = false;
        break;
      }
      pos += word.length;
    }

    if (matched) {
      return original.slice(idx, pos);
    }

    searchFrom = idx + 1;
  }

  return null;
}

function mapTechniqueToType(technique: string): FallacyType {
  if (!technique) return 'other';

  const lower = technique.toLowerCase().trim();

  if (lower in TECHNIQUE_NAME_MAP) {
    return TECHNIQUE_NAME_MAP[lower] as FallacyType;
  }

  const asKey = lower.replace(/[\s/-]+/g, '_');
  if (asKey in FALLACY_DEFINITIONS) {
    return asKey as FallacyType;
  }

  for (const [name, type] of Object.entries(TECHNIQUE_NAME_MAP)) {
    if (lower.includes(name) || name.includes(lower)) {
      return type as FallacyType;
    }
  }

  return 'other';
}

function getFallbackExplanation(type: FallacyType): string {
  const definition = FALLACY_DEFINITIONS[type];
  return definition?.softLanguageTemplate ??
    'This passage may use a rhetorical technique worth examining. Consider the context carefully.';
}

/**
 * Try to extract complete detection objects from a partially-streamed JSON string.
 * Looks for complete objects within the "detections" array by bracket matching.
 */
function parsePartialDetections(accumulated: string): Array<{
  technique: string;
  snippet: string;
  explanation: string;
  confidence: string;
  trigger_phrases?: string[];
}> {
  // Find the start of the detections array
  const detectionsStart = accumulated.indexOf('"detections"');
  if (detectionsStart === -1) return [];

  const arrayStart = accumulated.indexOf('[', detectionsStart);
  if (arrayStart === -1) return [];

  // Extract complete objects from the array by matching braces
  const detections: any[] = [];
  let depth = 0;
  let objectStart = -1;
  let inString = false;
  let escaped = false;

  for (let i = arrayStart + 1; i < accumulated.length; i++) {
    const char = accumulated[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '{') {
      if (depth === 0) objectStart = i;
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0 && objectStart >= 0) {
        const objectStr = accumulated.slice(objectStart, i + 1);
        try {
          detections.push(JSON.parse(objectStr));
        } catch {
          // Incomplete or malformed object
        }
        objectStart = -1;
      }
    }
  }

  return detections;
}

