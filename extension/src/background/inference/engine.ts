import type { InferenceEngine } from './types';
import type { ExtensionSettings } from '../../shared/messaging';
import { LocalEngine } from './local-engine';
import { RemoteEngine } from './remote-engine';

/**
 * Creates the appropriate inference engine based on the current mode.
 * 'local' uses Transformers.js with the bundled ONNX model.
 * 'remote' uses LLM-based inference (Ollama/OpenAI/Anthropic/Gemini).
 */
export function createEngine(
  mode: 'local' | 'remote',
  settings?: ExtensionSettings,
): InferenceEngine {
  if (mode === 'remote' && settings) {
    return new RemoteEngine(settings);
  }
  return new LocalEngine();
}
