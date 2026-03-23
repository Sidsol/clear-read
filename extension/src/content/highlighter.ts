/**
 * ClearRead Highlighter
 *
 * Renders inline annotations on the page: colored underlines on text
 * that matched a fallacy, with hover tooltips showing the fallacy name,
 * soft-language explanation, and confidence indicator.
 */

import type { AnalysisResult, SegmentAnalysis, FallacyDetection } from '../shared/types';
import { FALLACY_DEFINITIONS } from '../shared/constants';
import { sendMessage } from '../shared/messaging';

const HIGHLIGHT_ATTR = 'data-clearread-id';
let highlightCounter = 0;
let activeTooltip: HTMLElement | null = null;

/**
 * Remove all existing ClearRead highlights from the page.
 */
export function clearHighlights() {
  document.querySelectorAll(`[${HIGHLIGHT_ATTR}]`).forEach((el) => {
    const parent = el.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(el.textContent ?? ''), el);
      parent.normalize();
    }
  });
  removeTooltip();
}

/**
 * Apply inline highlights for an analysis result.
 * Searches the page for each segment's text and wraps matching portions
 * with colored underline spans. If multiple fallacies target the same text,
 * they are merged into a single highlight with multiple tooltip entries.
 */
export function applyHighlights(result: AnalysisResult) {
  clearHighlights();

  if (!result?.segments) return;

  for (const segment of result.segments) {
    if (!segment.fallacies?.length) continue;
    highlightSegment(segment);
  }
}

/**
 * Find and highlight a segment's text in the DOM.
 * If the text is already inside an existing highlight, merge the fallacies.
 */
function highlightSegment(segment: SegmentAnalysis) {
  const topFallacy = segment.fallacies.reduce((best, f) =>
    f.confidence > best.confidence ? f : best,
  );
  const definition = FALLACY_DEFINITIONS[topFallacy.type];
  if (!definition) return;

  const textToFind = segment.text.trim();
  if (textToFind.length < 10) return;

  // First, check if this text is already inside an existing highlight
  const existingHighlight = findExistingHighlight(textToFind);
  if (existingHighlight) {
    mergeIntoExistingHighlight(existingHighlight, segment.fallacies);
    return;
  }

  // Search the visible body text for this segment
  const treeWalker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        // Skip script, style, and our own elements
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName.toLowerCase();
        if (tag === 'script' || tag === 'style' || tag === 'noscript') {
          return NodeFilter.FILTER_REJECT;
        }
        if (parent.closest(`[${HIGHLIGHT_ATTR}]`)) {
          return NodeFilter.FILTER_REJECT;
        }
        if (parent.closest('.clearread-tooltip, .clearread-analyze-btn')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );

  // Collect text nodes and their content to find the segment
  const textNodes: Text[] = [];
  const textContents: string[] = [];
  let node: Node | null;
  while ((node = treeWalker.nextNode())) {
    textNodes.push(node as Text);
    textContents.push((node as Text).textContent ?? '');
  }

  // Try to find the segment text across sequential text nodes
  const fullText = textContents.join('');

  // Strip leading/trailing quotes from search text — LLMs often wrap snippets in quotes
  const stripped = textToFind.replace(/^[""\u201C\u201D'"'\u2018\u2019]+/, '').replace(/[""\u201C\u201D'"'\u2018\u2019.]+$/, '');
  const searchText = stripped.slice(0, 120); // use first 120 chars for matching

  // Try exact match first
  let idx = fullText.indexOf(searchText);

  // If exact match fails, try normalized matching
  if (idx === -1) {
    const normalize = (s: string) => s
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")  // smart single quotes
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')  // smart double quotes
      .replace(/["']/g, '')                          // strip all quotes for matching
      .replace(/[\u2013\u2014]/g, '-')               // em/en dashes
      .replace(/\u2026/g, '...')                     // ellipsis
      .replace(/\s+/g, ' ')                          // normalize whitespace
      .toLowerCase();

    const normalizedFull = normalize(fullText);
    const normalizedSearch = normalize(searchText);
    const normIdx = normalizedFull.indexOf(normalizedSearch);

    if (normIdx !== -1) {
      // Map normalized index back to original text position
      // Walk through original text counting normalized chars
      let origPos = 0;
      let normCount = 0;
      // Find the original position that corresponds to normIdx
      for (let i = 0; i < fullText.length && normCount < normIdx; i++) {
        const origChar = normalize(fullText[i]);
        if (origChar.length > 0) normCount += origChar.length;
        origPos = i + 1;
      }
      idx = origPos;
    }
  }

  // If still no match, try progressively more aggressive fuzzy search
  if (idx === -1 && searchText.length > 15) {
    // Build a character-level mapping from normalized positions back to original positions
    const normalize = (s: string) => s
      .replace(/[\u2018\u2019\u201A\u201B']/g, '')
      .replace(/[\u201C\u201D\u201E\u201F"]/g, '')
      .replace(/[.,!?;:]+/g, '')
      .replace(/\s+/g, ' ')
      .toLowerCase();

    const searchNorm = normalize(searchText).trim();

    // Build normalized fullText with position map
    const normChars: string[] = [];
    const origPositions: number[] = []; // normChars[i] came from fullText[origPositions[i]]
    for (let i = 0; i < fullText.length; i++) {
      const c = normalize(fullText[i]);
      for (const ch of c) {
        normChars.push(ch);
        origPositions.push(i);
      }
    }
    // Collapse multiple spaces
    const fullNormArr: string[] = [];
    const fullNormPos: number[] = [];
    for (let i = 0; i < normChars.length; i++) {
      if (normChars[i] === ' ' && fullNormArr.length > 0 && fullNormArr[fullNormArr.length - 1] === ' ') continue;
      fullNormArr.push(normChars[i]);
      fullNormPos.push(origPositions[i]);
    }
    const fullNorm = fullNormArr.join('');

    const normIdx = fullNorm.indexOf(searchNorm);
    if (normIdx !== -1) {
      idx = fullNormPos[normIdx] ?? 0;
    }

    // Last resort: use a contiguous substring from the middle
    if (idx === -1 && searchNorm.length > 30) {
      const midStart = Math.floor(searchNorm.length * 0.2);
      const midChunk = searchNorm.slice(midStart, midStart + Math.min(40, searchNorm.length - midStart));
      if (midChunk.length > 15) {
        const midIdx = fullNorm.indexOf(midChunk);
        if (midIdx !== -1) {
          const estimatedStart = midIdx - midStart;
          idx = fullNormPos[Math.max(0, estimatedStart)] ?? 0;
        }
      }
    }
  }

  if (idx === -1) return;

  // Determine how much text to highlight
  const highlightLength = Math.min(searchText.length, fullText.length - idx);

  // Map the character index back to the specific text node(s)
  let charOffset = 0;
  for (let i = 0; i < textNodes.length; i++) {
    const nodeText = textContents[i];
    const nodeStart = charOffset;
    const nodeEnd = charOffset + nodeText.length;

    // Does this node contain the start of our match?
    if (nodeStart <= idx && idx < nodeEnd) {
      const localStart = idx - nodeStart;
      const localEnd = Math.min(
        nodeText.length,
        localStart + highlightLength,
      );
      const matchText = nodeText.slice(localStart, localEnd);

      if (matchText.length > 0) {
        wrapTextRange(
          textNodes[i],
          localStart,
          localEnd,
          topFallacy,
          segment.fallacies,
          definition.color,
        );
      }
      break;
    }
    charOffset = nodeEnd;
  }
}

/**
 * Wrap a range within a text node with a highlight span.
 */
function wrapTextRange(
  textNode: Text,
  start: number,
  end: number,
  topFallacy: FallacyDetection,
  allFallacies: FallacyDetection[],
  color: string,
) {
  const text = textNode.textContent ?? '';
  if (start >= end || start >= text.length) return;

  const id = `clearread-${++highlightCounter}`;

  const before = text.slice(0, start);
  const match = text.slice(start, end);
  const after = text.slice(end);

  const span = document.createElement('span');
  span.className = 'clearread-highlight';
  span.setAttribute(HIGHLIGHT_ATTR, id);
  span.style.setProperty('--clearread-color', color);
  span.textContent = match;

  // Store fallacy data for tooltip
  span.dataset.fallacyType = topFallacy.type;
  span.dataset.confidence = String(topFallacy.confidence);
  span.dataset.fallacies = JSON.stringify(allFallacies);
  span.dataset.segmentText = match;

  // Tooltip events
  span.addEventListener('mouseenter', onHighlightHover);
  span.addEventListener('mouseleave', onHighlightLeave);

  // Click to open side panel and scroll to this fallacy
  span.addEventListener('click', onHighlightClick);

  const parent = textNode.parentNode;
  if (!parent) return;

  const frag = document.createDocumentFragment();
  if (before) frag.appendChild(document.createTextNode(before));
  frag.appendChild(span);
  if (after) frag.appendChild(document.createTextNode(after));

  parent.replaceChild(frag, textNode);
}

// ─── Overlapping Highlight Merge ─────────────────────────────────────

/**
 * Check if the given text is already inside an existing ClearRead highlight.
 * Returns the highlight element if found, null otherwise.
 */
function findExistingHighlight(text: string): HTMLElement | null {
  const stripped = text
    .replace(/^[""\u201C\u201D'"'\u2018\u2019]+/, '')
    .replace(/[""\u201C\u201D'"'\u2018\u2019.]+$/, '');
  const searchWords = stripped.toLowerCase().split(/\s+/).filter(w => w.length > 3).slice(0, 5);
  if (searchWords.length < 2) return null;

  const highlights = document.querySelectorAll(`[${HIGHLIGHT_ATTR}]`);
  for (const el of highlights) {
    const elText = (el.textContent ?? '').toLowerCase();
    // Check if most of the search words appear in this highlight
    const matchCount = searchWords.filter(w => elText.includes(w)).length;
    if (matchCount >= Math.min(searchWords.length, 3)) {
      return el as HTMLElement;
    }
  }
  return null;
}

/**
 * Merge additional fallacies into an existing highlight span.
 * Updates the stored fallacies data and tooltip to show all detections.
 */
function mergeIntoExistingHighlight(span: HTMLElement, newFallacies: FallacyDetection[]) {
  const existingJson = span.dataset.fallacies;
  let allFallacies: FallacyDetection[] = [];

  if (existingJson) {
    try {
      allFallacies = JSON.parse(existingJson);
    } catch { /* ignore parse errors */ }
  }

  // Add new fallacies, avoiding duplicates by type
  for (const f of newFallacies) {
    const alreadyExists = allFallacies.some(
      (existing) => existing.type === f.type && existing.explanation === f.explanation,
    );
    if (!alreadyExists) {
      allFallacies.push(f);
    }
  }

  // Update the stored data
  span.dataset.fallacies = JSON.stringify(allFallacies);

  // Update the color to the highest-confidence detection
  const topFallacy = allFallacies.reduce((best, f) =>
    f.confidence > best.confidence ? f : best,
  );
  const definition = FALLACY_DEFINITIONS[topFallacy.type];
  if (definition) {
    span.style.setProperty('--clearread-color', definition.color);
  }
}

// ─── Tooltip ─────────────────────────────────────────────────────────

function onHighlightHover(e: Event) {
  const span = e.currentTarget as HTMLElement;
  const fallaciesJson = span.dataset.fallacies;
  if (!fallaciesJson) return;

  const fallacies: FallacyDetection[] = JSON.parse(fallaciesJson);
  showTooltip(span, fallacies);
}

function onHighlightLeave() {
  removeTooltip();
}

function onHighlightClick(e: Event) {
  const span = e.currentTarget as HTMLElement;
  const segmentText = span.dataset.segmentText ?? span.textContent ?? '';

  // Open the side panel and scroll to this fallacy's card
  sendMessage({
    type: 'OPEN_SIDE_PANEL',
    payload: { scrollToText: segmentText },
  }).catch(() => {});
}

function showTooltip(anchor: HTMLElement, fallacies: FallacyDetection[]) {
  removeTooltip();

  const tooltip = document.createElement('div');
  tooltip.className = 'clearread-tooltip';

  for (const fallacy of fallacies) {
    const definition = FALLACY_DEFINITIONS[fallacy.type];
    if (!definition) continue;

    const card = document.createElement('div');
    card.className = 'clearread-tooltip-card';

    // Title
    const title = document.createElement('div');
    title.className = 'clearread-tooltip-title';
    title.textContent = definition.name;
    card.appendChild(title);

    // Explanation
    const explanation = document.createElement('div');
    explanation.className = 'clearread-tooltip-explanation';
    explanation.textContent = fallacy.explanation;
    card.appendChild(explanation);

    // Confidence
    const confidence = document.createElement('span');
    confidence.className = 'clearread-tooltip-confidence';
    const level =
      fallacy.confidence >= 0.8
        ? 'High confidence'
        : fallacy.confidence >= 0.4
        ? 'Moderate confidence'
        : 'Low confidence';
    confidence.textContent = level;
    card.appendChild(confidence);

    tooltip.appendChild(card);
  }

  document.body.appendChild(tooltip);
  activeTooltip = tooltip;

  // Position above the anchor
  const anchorRect = anchor.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();

  let left = anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2;
  let top = anchorRect.top - tooltipRect.height - 8;

  // Keep on screen
  left = Math.max(8, Math.min(left, window.innerWidth - tooltipRect.width - 8));
  if (top < 8) {
    top = anchorRect.bottom + 8;
  }

  tooltip.style.left = `${left + window.scrollX}px`;
  tooltip.style.top = `${top + window.scrollY}px`;
}

function removeTooltip() {
  if (activeTooltip) {
    activeTooltip.remove();
    activeTooltip = null;
  }
}
