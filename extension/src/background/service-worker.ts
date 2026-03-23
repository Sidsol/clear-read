import type { ExtensionMessage } from '../shared/messaging';
import { sendTabMessage } from '../shared/messaging';
import { getSettings, saveSettings } from '../shared/storage';
import { createEngine } from './inference/engine';

/**
 * ClearRead Background Service Worker
 *
 * Handles message routing between content scripts, popup, and side panel.
 * Orchestrates inference engine calls.
 */

// Active analysis abort controller — allows cancellation
let activeAbortController: AbortController | null = null;

// Listen for messages from content scripts, popup, and side panel
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, sender, sendResponse) => {
    handleMessage(message, sender)
      .then((result) => {
        // sendResponse may fail if the message channel already closed (long-running analysis)
        try { sendResponse(result); } catch { /* channel closed, result already broadcast */ }
      })
      .catch((err) => {
        console.error('[ClearRead] Message handler error:', err);
        try { sendResponse({ error: String(err) }); } catch { /* channel closed */ }
      });
    return true; // keep the message channel open for async response
  },
);

async function handleMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  switch (message.type) {
    case 'ANALYZE_SELECTION':
    case 'ANALYZE_FULL_PAGE': {
      // Cancel any in-flight analysis
      if (activeAbortController) {
        activeAbortController.abort();
      }
      activeAbortController = new AbortController();
      const signal = activeAbortController.signal;

      const settings = await getSettings();
      const engineMode = message.payload.engineOverride ?? settings.inferenceMode;
      const engine = createEngine(engineMode, settings);

      // Mark as loading in session storage so the side panel shows loading state on mount
      await chrome.storage.session.set({ analysisLoading: true, latestError: null });

      // Keep the service worker alive during long-running analysis (Ollama can take 30-60s+)
      const keepAlive = setInterval(() => {
        chrome.runtime.getPlatformInfo(() => {});
      }, 20000);

      try {
        const result = await engine.analyze(message.payload.text, signal, (partial) => {
          // Broadcast partial results to the side panel
          chrome.runtime.sendMessage({
            type: 'ANALYSIS_PARTIAL',
            payload: {
              segments: partial.segments ?? [],
              overallAssessment: partial.overallAssessment ?? 'Analyzing...',
            },
          }).catch(() => {});
        });

        // Attach the analyzed text for transparency
        result.analyzedText = message.payload.text;

        // Clear the keepAlive and controller now that we're done
        clearInterval(keepAlive);
        activeAbortController = null;

        if (signal.aborted) return { cancelled: true };

        // Determine the tab to send results to
        const tabId = sender.tab?.id ?? (await getActiveTabId());

        // Send results to the content script (may fail on restricted pages)
        if (tabId) {
          sendTabMessage(tabId, {
            type: 'ANALYSIS_RESULT',
            payload: result,
          }).catch(() => { /* content script not available on this page */ });
        }

        // Store result so the side panel can read it on load
        await chrome.storage.session.set({ latestAnalysis: result, latestError: null, analysisLoading: false });

        // Broadcast to side panel and other extension pages
        chrome.runtime.sendMessage({
          type: 'ANALYSIS_RESULT',
          payload: result,
        }).catch(() => { /* side panel may not be open yet */ });

        return result;
      } catch (err) {
        clearInterval(keepAlive);
        activeAbortController = null;

        // Don't broadcast error if we cancelled intentionally
        if (signal.aborted) {
          return { cancelled: true };
        }

        const errorMessage = formatEngineError(err, engineMode);
        console.error('[ClearRead] Analysis failed:', errorMessage);

        // Store and broadcast error — wrapped in try/catch to prevent cascading failures
        try {
          await chrome.storage.session.set({ latestError: errorMessage, latestAnalysis: null, analysisLoading: false });
        } catch (storageErr) {
          console.error('[ClearRead] Failed to store error:', storageErr);
        }

        chrome.runtime.sendMessage({
          type: 'ANALYSIS_ERROR',
          payload: { error: errorMessage },
        }).catch(() => {});

        return { error: errorMessage };
      }
    }

    case 'CANCEL_ANALYSIS': {
      if (activeAbortController) {
        activeAbortController.abort();
        activeAbortController = null;
        console.log('[ClearRead] Analysis cancelled by user');
      }
      return { cancelled: true };
    }

    case 'OPEN_SIDE_PANEL': {
      const tabId = sender.tab?.id ?? (await getActiveTabId());
      if (tabId) {
        await chrome.sidePanel.open({ tabId });

        // If a scroll target was provided, broadcast after a short delay
        // to let the side panel mount
        const scrollToText = message.payload?.scrollToText;
        if (scrollToText) {
          setTimeout(() => {
            chrome.runtime.sendMessage({
              type: 'SCROLL_TO_FALLACY',
              payload: { text: scrollToText },
            }).catch(() => {});
          }, 300);
        }
      }
      return { ok: true };
    }

    case 'GET_SETTINGS': {
      return await getSettings();
    }

    case 'UPDATE_SETTINGS': {
      return await saveSettings(message.payload);
    }

    case 'TEST_CHROME_AI': {
      try {
        const ai = (globalThis as any).ai;
        if (!ai?.languageModel) {
          return {
            available: false,
            reason: 'API not found (self.ai.languageModel is undefined). Enable the required flags and restart the browser.',
          };
        }
        const capabilities = await ai.languageModel.capabilities();
        return {
          available: capabilities.available === 'readily',
          status: capabilities.available,
          reason: capabilities.available === 'after-download'
            ? 'Model is still downloading in the background. Wait a few minutes and try again.'
            : capabilities.available === 'no'
              ? 'Not supported on this device.'
              : undefined,
        };
      } catch (err) {
        return { available: false, reason: String(err) };
      }
    }

    default:
      console.warn('[ClearRead] Unknown message type:', message);
      return { error: 'Unknown message type' };
  }
}

async function getActiveTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

console.log('[ClearRead] Service worker loaded');

function formatEngineError(err: unknown, engineMode: string): string {
  const raw = String(err);
  if (raw.includes('Failed to fetch') || raw.includes('NetworkError') || raw.includes('ECONNREFUSED')) {
    if (engineMode === 'remote') {
      return 'Could not connect to the LLM provider. If using Ollama, make sure it is running (ollama serve). For cloud providers, check your API key and internet connection.';
    }
    return 'Network error during analysis. Please check your connection and try again.';
  }
  if (raw.includes('401') || raw.includes('Unauthorized') || raw.includes('invalid_api_key')) {
    return 'Invalid API key. Please check your API key in the ClearRead settings.';
  }
  if (raw.includes('429') || raw.includes('rate_limit')) {
    return 'Rate limit exceeded. Please wait a moment and try again.';
  }
  if (raw.includes('500') || raw.includes('Internal Server Error')) {
    return 'The LLM server encountered an internal error (500). This may be a temporary issue — try again, or try a smaller text selection.';
  }
  if (raw.includes('model') && raw.includes('not found')) {
    return 'The specified model was not found. Check the model name in settings.';
  }
  return `Analysis failed: ${raw.length > 200 ? raw.slice(0, 200) + '…' : raw}`;
}
