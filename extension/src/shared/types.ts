/** Fallacy type identifiers — maps to the taxonomy */
export type FallacyType =
  | 'straw_man'
  | 'begging_the_question'
  | 'ad_hominem'
  | 'post_hoc'
  | 'false_dichotomy'
  | 'equivocation'
  | 'appeal_to_authority'
  | 'hasty_generalization'
  | 'appeal_to_popular_opinion'
  | 'red_herring'
  | 'appeal_to_emotion'
  | 'whataboutism'
  | 'loaded_language'
  | 'slippery_slope'
  | 'loaded_question'
  | 'false_equivalence'
  | 'circular_reasoning'
  | 'false_analogy'
  | 'appeal_to_ignorance'
  | 'appeal_to_nature'
  | 'appeal_to_tradition'
  | 'no_true_scotsman'
  | 'guilt_by_association'
  | 'cherry_picking'
  | 'genetic_fallacy'
  | 'composition_division'
  | 'anecdotal_evidence'
  | 'appeal_to_consequence'
  | 'shifting_burden_of_proof'
  | 'glittering_generalities'
  | 'plain_folks'
  | 'transfer'
  | 'testimonial'
  | 'name_calling'
  | 'scapegoating'
  | 'fear_mongering'
  | 'dog_whistle'
  | 'innuendo'
  | 'projection'
  | 'sloganeering'
  | 'euphemism_dysphemism'
  | 'other';

export interface FallacyDetection {
  type: FallacyType;
  confidence: number; // 0.0 – 1.0
  explanation: string; // soft-language, human-readable
  llmLabel?: string; // raw LLM label when type is 'other'
  argumentMap?: ArgumentMap; // structured argument breakdown (LLM only)
}

export interface ArgumentMap {
  conclusion: string;
  premises: ArgumentPremise[];
  logicalGaps: string[];
  missingEvidence: string[];
  steelman: string;
}

export interface ArgumentPremise {
  text: string;
  type: 'supporting' | 'irrelevant' | 'weak' | 'unsupported';
  issue?: string;
}

export interface TokenAttribution {
  token: string;
  score: number; // attribution weight
}

export interface SegmentAnalysis {
  text: string;
  fallacies: FallacyDetection[];
  highlightTokens?: TokenAttribution[];
}

export interface AnalysisResult {
  segments: SegmentAnalysis[];
  overallAssessment: string;
  timestamp: number;
  source: 'local' | 'remote';
  analyzedText?: string;
  tokenUsage?: {
    prompt: number;
    completion: number;
  };
}

/** Inference engine interface — swap local/remote without touching consumers */
export interface InferenceEngine {
  analyze(
    text: string,
    signal?: AbortSignal,
    onProgress?: (partial: Partial<AnalysisResult>) => void,
  ): Promise<AnalysisResult>;
  isAvailable(): Promise<boolean>;
}

/** Future persistence hook */
export interface AnalysisStore {
  save(result: AnalysisResult & { url: string }): Promise<void>;
  getByUrl(url: string): Promise<AnalysisResult[]>;
  getRecent(limit: number): Promise<AnalysisResult[]>;
  clear(): Promise<void>;
}
