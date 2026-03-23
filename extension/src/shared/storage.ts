import type { ExtensionSettings } from './messaging';
import { DEFAULT_CONFIDENCE_THRESHOLD } from './constants';

const SETTINGS_KEY = 'clearread_settings';

const DEFAULT_SETTINGS: ExtensionSettings = {
  confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
  inferenceMode: 'local',
  remoteProvider: 'ollama',
  apiKey: '',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.1:8b',
  ollamaContextSize: 8192,
  remoteModel: '',
};

/** Load extension settings from chrome.storage.local */
export async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...result[SETTINGS_KEY] };
}

/** Save extension settings to chrome.storage.local */
export async function saveSettings(
  settings: Partial<ExtensionSettings>,
): Promise<ExtensionSettings> {
  const current = await getSettings();
  const updated = { ...current, ...settings };
  await chrome.storage.local.set({ [SETTINGS_KEY]: updated });
  return updated;
}
