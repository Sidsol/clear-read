import type { AnalysisResult } from './types';

/**
 * Message types for Chrome message passing between
 * content script, service worker, popup, and side panel.
 */

export type MessageType =
  | 'ANALYZE_SELECTION'
  | 'ANALYZE_FULL_PAGE'
  | 'ANALYSIS_RESULT'
  | 'ANALYSIS_PARTIAL'
  | 'ANALYSIS_ERROR'
  | 'CANCEL_ANALYSIS'
  | 'OPEN_SIDE_PANEL'
  | 'SCROLL_TO_HIGHLIGHT'
  | 'SCROLL_TO_FALLACY'
  | 'GET_SETTINGS'
  | 'UPDATE_SETTINGS';

export interface AnalyzeSelectionMessage {
  type: 'ANALYZE_SELECTION';
  payload: {
    text: string;
    url: string;
    engineOverride?: 'local' | 'remote';
  };
}

export interface AnalyzeFullPageMessage {
  type: 'ANALYZE_FULL_PAGE';
  payload: {
    text: string;
    url: string;
    engineOverride?: 'local' | 'remote';
  };
}

export interface AnalysisResultMessage {
  type: 'ANALYSIS_RESULT';
  payload: AnalysisResult;
}

export interface AnalysisErrorMessage {
  type: 'ANALYSIS_ERROR';
  payload: {
    error: string;
  };
}

export interface OpenSidePanelMessage {
  type: 'OPEN_SIDE_PANEL';
  payload?: {
    scrollToText?: string;
  };
}

export interface ScrollToHighlightMessage {
  type: 'SCROLL_TO_HIGHLIGHT';
  payload: {
    text: string;
  };
}

export interface CancelAnalysisMessage {
  type: 'CANCEL_ANALYSIS';
}

export interface ScrollToFallacyMessage {
  type: 'SCROLL_TO_FALLACY';
  payload: {
    text: string;
  };
}

export interface GetSettingsMessage {
  type: 'GET_SETTINGS';
}

export interface UpdateSettingsMessage {
  type: 'UPDATE_SETTINGS';
  payload: Partial<ExtensionSettings>;
}

export interface ExtensionSettings {
  confidenceThreshold: number;
  inferenceMode: 'local' | 'remote';
  remoteProvider: 'ollama' | 'openai' | 'anthropic' | 'gemini' | 'chrome_ai';
  apiKey: string;
  ollamaUrl: string;
  ollamaModel: string;
  ollamaContextSize: number;
  remoteModel: string;
}

export type ExtensionMessage =
  | AnalyzeSelectionMessage
  | AnalyzeFullPageMessage
  | AnalysisResultMessage
  | AnalysisPartialMessage
  | AnalysisErrorMessage
  | OpenSidePanelMessage
  | ScrollToHighlightMessage
  | ScrollToFallacyMessage
  | CancelAnalysisMessage
  | GetSettingsMessage
  | UpdateSettingsMessage
  | TestChromeAIMessage;

export interface AnalysisPartialMessage {
  type: 'ANALYSIS_PARTIAL';
  payload: {
    segments: import('../shared/types').SegmentAnalysis[];
    overallAssessment: string;
  };
}

export interface TestChromeAIMessage {
  type: 'TEST_CHROME_AI';
}

/** Send a message to the background service worker */
export function sendMessage(message: ExtensionMessage): Promise<unknown> {
  return chrome.runtime.sendMessage(message);
}

/** Send a message to a specific tab's content script */
export function sendTabMessage(
  tabId: number,
  message: ExtensionMessage,
): Promise<unknown> {
  return chrome.tabs.sendMessage(tabId, message);
}
