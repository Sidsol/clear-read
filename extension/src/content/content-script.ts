/**
 * ClearRead Content Script
 *
 * Listens for text selection on the page, shows a floating "Analyze" button,
 * and communicates with the background service worker.
 */

import type { ExtensionMessage } from '../shared/messaging';
import { sendMessage } from '../shared/messaging';
import type { AnalysisResult } from '../shared/types';
import { applyHighlights } from './highlighter';

let analyzeButton: HTMLElement | null = null;
let engineDropdown: HTMLElement | null = null;
let currentSelection = '';

// ─── Message Listener ────────────────────────────────────────────────
try {
  chrome.runtime.onMessage.addListener(
    (message: ExtensionMessage, _sender, sendResponse) => {
      try {
        if (message.type === 'ANALYSIS_RESULT') {
          console.log('[ClearRead] Received analysis result:', message.payload);
          handleAnalysisResult(message.payload);
        }
        if (message.type === 'SCROLL_TO_HIGHLIGHT') {
          scrollToHighlightedText(message.payload.text);
        }
      } catch (err) {
        console.warn('[ClearRead] Message handler error:', err);
      }
      sendResponse({ received: true });
    },
  );
} catch {
  // Extension context invalidated — content script is stale
  console.warn('[ClearRead] Extension context invalidated on startup');
}

// ─── Analysis Result Handler ────────────────────────────────────────────
function handleAnalysisResult(result: AnalysisResult) {
  if (!result?.segments?.length) {
    console.log('[ClearRead] No segments in result');
    return;
  }
  const totalFallacies = result.segments.reduce(
    (sum, seg) => sum + (seg.fallacies?.length ?? 0),
    0,
  );
  if (totalFallacies > 0) {
    console.log(`[ClearRead] ${totalFallacies} fallacies detected — applying highlights`);
    applyHighlights(result);
  } else {
    console.log('[ClearRead] No fallacies detected');
  }
}

// ─── Floating Split Button ────────────────────────────────────────────
function createAnalyzeButton(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'clearread-split-btn';

  // Main button
  const main = document.createElement('button');
  main.className = 'clearread-split-main';
  main.textContent = '🔍 Analyze with ClearRead';
  main.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
  main.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onAnalyzeClick();
  });

  // Chevron dropdown trigger
  const chevron = document.createElement('button');
  chevron.className = 'clearread-split-chevron';
  chevron.textContent = '▾';
  chevron.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
  chevron.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleEngineDropdown();
  });

  container.appendChild(main);
  container.appendChild(chevron);
  return container;
}

function toggleEngineDropdown() {
  if (engineDropdown) {
    engineDropdown.remove();
    engineDropdown = null;
    return;
  }
  if (!analyzeButton) return;

  engineDropdown = document.createElement('div');
  engineDropdown.className = 'clearread-engine-dropdown';

  const localOption = document.createElement('button');
  localOption.className = 'clearread-engine-option';
  localOption.textContent = '🧠 Use Local Model';
  localOption.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
  localOption.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onAnalyzeClick('local');
  });

  const llmOption = document.createElement('button');
  llmOption.className = 'clearread-engine-option';
  llmOption.textContent = '🤖 Use LLM';
  llmOption.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
  llmOption.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onAnalyzeClick('remote');
  });

  engineDropdown.appendChild(localOption);
  engineDropdown.appendChild(llmOption);

  // Position below the split button
  const btnRect = analyzeButton.getBoundingClientRect();
  engineDropdown.style.left = `${btnRect.left + window.scrollX}px`;
  engineDropdown.style.top = `${btnRect.bottom + window.scrollY + 4}px`;

  document.body.appendChild(engineDropdown);
}

function showAnalyzeButton(x: number, y: number) {
  removeAnalyzeButton();
  analyzeButton = createAnalyzeButton();
  document.body.appendChild(analyzeButton);

  // Position the button above the selection point
  const btnRect = { width: 240, height: 32 }; // approximate
  let left = x - btnRect.width / 2;
  let top = y - btnRect.height - 10;

  // Keep on screen
  left = Math.max(8, Math.min(left, window.innerWidth - btnRect.width - 8));
  if (top < 8) {
    top = y + 20; // show below if too close to top
  }

  analyzeButton.style.left = `${left + window.scrollX}px`;
  analyzeButton.style.top = `${top + window.scrollY}px`;
}

function removeAnalyzeButton() {
  if (analyzeButton) {
    analyzeButton.remove();
    analyzeButton = null;
  }
  if (engineDropdown) {
    engineDropdown.remove();
    engineDropdown = null;
  }
}

// ─── Selection Handling ──────────────────────────────────────────────
function getSelectionPosition(): { x: number; y: number } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return {
    x: rect.left + rect.width / 2,
    y: rect.top,
  };
}

document.addEventListener('mouseup', (e) => {
  // Ignore clicks on our own button
  if (analyzeButton && analyzeButton.contains(e.target as Node)) return;
  if (engineDropdown && engineDropdown.contains(e.target as Node)) return;

  // Longer delay for SPAs (X.com, YouTube) that manipulate selection asynchronously
  setTimeout(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? '';

    if (text.length < 10) {
      // Too short to analyze meaningfully
      removeAnalyzeButton();
      currentSelection = '';
      return;
    }

    currentSelection = text;
    const pos = getSelectionPosition();
    if (pos) {
      showAnalyzeButton(pos.x, pos.y);
    }
  }, 50);
}, true); // capture phase — fires before site handlers can stop propagation

// Remove button when clicking elsewhere or pressing Escape
document.addEventListener('mousedown', (e) => {
  if (analyzeButton && !analyzeButton.contains(e.target as Node) &&
      (!engineDropdown || !engineDropdown.contains(e.target as Node))) {
    removeAnalyzeButton();
  }
}, true);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    removeAnalyzeButton();
  }
}, true);

// ─── Analyze Action ──────────────────────────────────────────────────
async function onAnalyzeClick(engineOverride?: 'local' | 'remote') {
  if (!currentSelection) return;

  const text = currentSelection;
  removeAnalyzeButton();

  console.log('[ClearRead] Analyzing selection:', text.slice(0, 100), engineOverride ? `(engine: ${engineOverride})` : '(default)');

  try {
    await sendMessage({
      type: 'ANALYZE_SELECTION',
      payload: {
        text,
        url: window.location.href,
        engineOverride,
      },
    });

    // Update the default engine setting if the user explicitly chose one
    if (engineOverride) {
      sendMessage({
        type: 'UPDATE_SETTINGS',
        payload: { inferenceMode: engineOverride },
      }).catch(() => {});
    }
  } catch (err) {
    if (String(err).includes('Extension context invalidated')) {
      showContextInvalidatedNotice();
    } else {
      console.error('[ClearRead] Failed to send analysis request:', err);
    }
  }
}

function showContextInvalidatedNotice() {
  const notice = document.createElement('div');
  notice.className = 'clearread-tooltip';
  notice.style.position = 'fixed';
  notice.style.top = '16px';
  notice.style.right = '16px';
  notice.style.left = 'auto';
  notice.style.cursor = 'pointer';
  notice.style.pointerEvents = 'auto';
  notice.innerHTML =
    '<div class="clearread-tooltip-title">ClearRead was updated</div>' +
    '<div class="clearread-tooltip-explanation">Please refresh the page to use the latest version.</div>';
  notice.addEventListener('click', () => notice.remove());
  document.body.appendChild(notice);
  setTimeout(() => notice.remove(), 6000);
}

// ─── Scroll to Highlight ─────────────────────────────────────────────
function scrollToHighlightedText(text: string) {
  const highlights = document.querySelectorAll('[data-clearread-id]');
  for (const el of highlights) {
    if (text.includes(el.textContent ?? '')) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Brief flash to draw attention
      const htmlEl = el as HTMLElement;
      htmlEl.style.transition = 'background-color 0.3s ease';
      htmlEl.style.backgroundColor = 'rgba(37, 99, 235, 0.3)';
      setTimeout(() => {
        htmlEl.style.backgroundColor = '';
      }, 1500);
      return;
    }
  }
}

console.log('[ClearRead] Content script loaded');
