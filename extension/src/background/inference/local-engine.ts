import {
  pipeline,
  AutoTokenizer,
  env,
  type TextClassificationOutput,
  type PreTrainedTokenizer,
} from '@huggingface/transformers';
import type { InferenceEngine, AnalysisResult, FallacyType, TokenAttribution } from './types';
import { FALLACY_DEFINITIONS, DEFAULT_CONFIDENCE_THRESHOLD } from '../../shared/constants';

// Configure Transformers.js for extension environment
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.useBrowserCache = false;
// Point to extension root — model files are at /model/config.json, /model/onnx/model_quantized.onnx, etc.
env.localModelPath = chrome.runtime.getURL('');

const MODEL_NAME = 'model';
const CLAIM_MODEL_NAME = 'claim_model';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let classifierInstance: any = null;
let claimDetectorInstance: any = null;
let tokenizerInstance: PreTrainedTokenizer | null = null;

async function getClassifier() {
  if (!classifierInstance) {
    console.log('[ClearRead] Loading fallacy classifier:', MODEL_NAME);
    classifierInstance = await (pipeline as any)('text-classification', MODEL_NAME);
    console.log('[ClearRead] Fallacy classifier loaded');
  }
  return classifierInstance;
}

async function getClaimDetector() {
  if (!claimDetectorInstance) {
    console.log('[ClearRead] Loading claim detector:', CLAIM_MODEL_NAME);
    claimDetectorInstance = await (pipeline as any)('text-classification', CLAIM_MODEL_NAME);
    console.log('[ClearRead] Claim detector loaded');
  }
  return claimDetectorInstance;
}

async function getTokenizer(): Promise<PreTrainedTokenizer> {
  if (!tokenizerInstance) {
    tokenizerInstance = await (AutoTokenizer as any).from_pretrained(MODEL_NAME);
  }
  return tokenizerInstance!;
}

/**
 * Split text into sentences for per-segment analysis.
 */
function splitIntoSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by space or end
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);

  // If no good sentence boundaries, return the whole text as one segment
  if (sentences.length === 0) return [text];
  return sentences;
}

/**
 * Map a model label string to our FallacyType
 */
function labelToFallacyType(label: string): FallacyType | null {
  // The model outputs labels matching our FallacyType values
  if (label in FALLACY_DEFINITIONS) {
    return label as FallacyType;
  }
  // Try with LABEL_ prefix stripped (in case model outputs differ)
  const cleaned = label.replace(/^LABEL_/, '').toLowerCase();
  if (cleaned in FALLACY_DEFINITIONS) {
    return cleaned as FallacyType;
  }
  return null;
}

export class LocalEngine implements InferenceEngine {
  async analyze(text: string, signal?: AbortSignal): Promise<AnalysisResult> {
    const classifier = await getClassifier();
    const claimDetector = await getClaimDetector();
    const sentences = splitIntoSentences(text);

    // Read user-configured confidence threshold
    const stored = await chrome.storage.local.get('clearread_settings');
    const threshold = stored.clearread_settings?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;

    // Process sentences sequentially
    const segments = [];
    let filteredCount = 0;

    for (const sentence of sentences) {
      signal?.throwIfAborted();

      // Step 1: Claim detection — skip neutral/factual sentences
      const claimOutput = await claimDetector(sentence, { top_k: 2 }) as TextClassificationOutput;
      const claimResults = Array.isArray(claimOutput[0]) ? claimOutput[0] : claimOutput;
      const topClaim = (claimResults as Array<{ label: string; score: number }>)
        .reduce((best, r) => r.score > best.score ? r : best);

      if (topClaim.label === 'neutral' && topClaim.score > 0.7) {
        // Skip neutral sentences — not worth classifying for fallacies
        filteredCount++;
        continue;
      }

      // Step 2: Fallacy classification on claims only
      const output = await classifier(sentence, {
        top_k: 3,
      }) as TextClassificationOutput;

      const results = Array.isArray(output[0]) ? output[0] : output;

      const fallacies = (results as Array<{ label: string; score: number }>)
        .filter((r) => r.score >= threshold)
        .map((r) => {
          const fallacyType = labelToFallacyType(r.label);
          if (!fallacyType) return null;
          const definition = FALLACY_DEFINITIONS[fallacyType];
          return {
            type: fallacyType,
            confidence: r.score,
            explanation: definition.softLanguageTemplate,
          };
        })
        .filter((f): f is NonNullable<typeof f> => f !== null);

      // Compute token attributions for segments with detected fallacies
      let highlightTokens: TokenAttribution[] | undefined;
      if (fallacies.length > 0) {
        try {
          highlightTokens = await this.computeAttributions(
            classifier,
            sentence,
            fallacies[0].type,
            fallacies[0].confidence,
          );
        } catch (err) {
          console.warn('[ClearRead] Attribution computation failed:', err);
        }
      }

      segments.push({
        text: sentence,
        fallacies,
        highlightTokens,
      });
    }

    const totalFallacies = segments.reduce(
      (sum, seg) => sum + seg.fallacies.length,
      0,
    );

    const analyzed = sentences.length - filteredCount;
    const filterNote = filteredCount > 0
      ? ` (${filteredCount} neutral sentence${filteredCount > 1 ? 's' : ''} filtered by claim detector)`
      : '';

    let overallAssessment: string;
    if (totalFallacies === 0) {
      overallAssessment =
        `No significant rhetorical concerns were detected in ${analyzed} analyzed sentence${analyzed > 1 ? 's' : ''}${filterNote}. As always, consider consulting multiple sources for important claims.`;
    } else if (totalFallacies <= 2) {
      overallAssessment = `This text contains ${totalFallacies} passage(s) that may use rhetorical techniques worth examining${filterNote}. Review the highlighted sections for more detail.`;
    } else {
      overallAssessment = `This text contains ${totalFallacies} passages that may use rhetorical techniques${filterNote}. Consider reading with a critical eye and consulting additional sources.`;
    }

    return {
      segments,
      overallAssessment,
      timestamp: Date.now(),
      source: 'local',
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      await getClassifier();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Compute token-level attributions using leave-one-out occlusion.
   * For each word-level token, remove it from the input and measure
   * how much the prediction confidence drops. Higher drop = more important.
   */
  private async computeAttributions(
    classifier: any,
    text: string,
    targetLabel: FallacyType,
    baselineScore: number,
  ): Promise<TokenAttribution[]> {
    const tokenizer = await getTokenizer();
    const encoded = tokenizer(text, { return_offsets_mapping: true } as any);

    // Get token strings from offsets
    const inputIds = encoded.input_ids?.data ?? encoded.input_ids;
    const tokens: string[] = [];
    const tokenTexts: string[] = [];

    // Decode each token individually (skip special tokens at start/end)
    const idArray = Array.from(inputIds as any) as number[];
    for (let i = 0; i < idArray.length; i++) {
      const decoded = tokenizer.decode([idArray[i]], { skip_special_tokens: true });
      if (decoded.trim().length > 0) {
        tokens.push(decoded);
        tokenTexts.push(decoded);
      }
    }

    if (tokens.length === 0) return [];

    // Merge subword tokens into word-level tokens for cleaner attribution
    const words: { text: string; tokenIndices: number[] }[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      // RoBERTa uses leading space for word starts (BPE); tokens without it are continuations
      const isWordStart = tok.startsWith(' ') || tok.startsWith('Ġ') || i === 0;
      if (isWordStart || words.length === 0) {
        words.push({ text: tok.trim(), tokenIndices: [i] });
      } else {
        words[words.length - 1].text += tok;
        words[words.length - 1].tokenIndices.push(i);
      }
    }

    // Cap the number of occlusion runs (each is a full inference call)
    const MAX_WORDS = 10;
    const wordsToTest = words.length > MAX_WORDS
      ? words.slice(0, MAX_WORDS)
      : words;

    // Run occlusion: remove each word and measure confidence change
    const attributions: TokenAttribution[] = [];

    for (const word of wordsToTest) {
      // Build text with this word removed
      const remaining = words
        .filter((w) => w !== word)
        .map((w) => w.text)
        .join(' ');

      if (remaining.trim().length < 5) {
        // Too short after removal — this word is essential
        attributions.push({ token: word.text, score: baselineScore });
        continue;
      }

      try {
        const output = await classifier(remaining, { top_k: 10 }) as TextClassificationOutput;
        const results = Array.isArray(output[0]) ? output[0] : output;

        // Find the score for the target label
        const targetResult = (results as Array<{ label: string; score: number }>)
          .find((r) => labelToFallacyType(r.label) === targetLabel);
        const occludedScore = targetResult?.score ?? 0;

        // Attribution = how much confidence dropped when this word was removed
        const drop = baselineScore - occludedScore;
        attributions.push({ token: word.text, score: Math.max(0, drop) });
      } catch {
        attributions.push({ token: word.text, score: 0 });
      }
    }

    // Normalize scores to 0–1 range
    const maxScore = Math.max(...attributions.map((a) => a.score), 0.001);
    for (const attr of attributions) {
      attr.score = attr.score / maxScore;
    }

    return attributions;
  }
}
