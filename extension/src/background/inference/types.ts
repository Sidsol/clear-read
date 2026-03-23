/**
 * Re-exports shared types used by the inference layer.
 * Inference-specific types can be added here as the engine evolves.
 */
export type {
  InferenceEngine,
  AnalysisResult,
  SegmentAnalysis,
  FallacyDetection,
  FallacyType,
  TokenAttribution,
} from '../../shared/types';
