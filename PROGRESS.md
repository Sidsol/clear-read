# ClearRead — Implementation Progress

## Schedule (2 weeks: March 15 – March 29, 2026)

### Week 1: Core Infrastructure + Model Training

| Day | Date | Focus | Status |
|-----|------|-------|--------|
| 1 | Mar 15 | Setup — scaffolding, Manifest V3, Vite, dev tooling | ✅ Complete |
| 2 | Mar 16 | Content Script — selection listener, floating button, messaging | ✅ Complete |
| 3 | Mar 17 | Data Prep — download datasets, prepare_data.py, label mapping | ✅ Complete |
| 4 | Mar 18 | Model Training — fine-tune DistilRoBERTa, evaluate | ✅ Complete |
| 5 | Mar 19 | ONNX Export + Integration — export, quantize, Transformers.js | ✅ Complete |
| 6 | Mar 20 | Inline UI — highlighter, colored underlines, tooltips | ✅ Complete |
| 7 | Mar 21 | Buffer / Catch-up — stabilize, begin side panel | ✅ Complete |

### Week 2: Side Panel, Polish, Extensibility

| Day | Date | Focus | Status |
|-----|------|-------|--------|
| 8 | Mar 22 | Side Panel — React components, analysis display | ✅ Complete |
| 9 | Mar 23 | Explainability — token attribution, ExplainabilityView | ✅ Complete |
| 10 | Mar 24 | Remote Inference — LLM agent prompt, remote-engine, split button, settings | ✅ Complete |
| 11 | Mar 25 | Smart Text Extraction — generic article parser | ✅ Complete |
| 12 | Mar 26 | UX Polish — loading states, confidence slider, edge cases | ✅ Complete |
| 13 | Mar 27 | Testing — manual + unit tests | ⬜ Not Started |
| 14 | Mar 28-29 | Finalize — bug fixes, packaging, README | ⬜ Not Started |

---

## Detailed Task Tracking

### Day 1 — Setup (March 15)

- [x] Create progress tracking file
- [x] Scaffold extension directory structure
- [x] Create package.json with dependencies
- [x] Create tsconfig.json
- [x] Create vite.config.ts with CRXJS plugin
- [x] Create manifest.json (Manifest V3)
- [x] Create shared types (inference types, fallacy types)
- [x] Create shared constants (fallacy definitions + soft-language templates)
- [x] Create messaging module (Chrome message types)
- [x] Create storage module (chrome.storage wrapper)
- [x] Create background service worker (skeleton)
- [x] Create inference engine interface + types
- [x] Create content script (skeleton)
- [x] Create popup (Hello World — React)
- [x] Create side panel (skeleton HTML + React entry)
- [x] Scaffold model training directory (Python)
- [x] Install dependencies and verify build
- [x] Verify extension loads in Chrome/Edge
- [x] Fix: added `scripting` permission for full-page analysis
- [x] Fix: moved content.css to public/ for proper bundling
- [x] Fix: side panel opens from popup (user gesture context)
- [x] Fix: results stored in chrome.storage.session for side panel reliability
- [x] End-to-end verified: popup → analyze → side panel shows stub result

### Day 2 — Content Script (March 16)

- [x] Text selection listener (mouseup with 10+ char minimum)
- [x] Floating "Analyze with ClearRead" button (positioned above selection, fade-in animation)
- [x] Message passing from content script to service worker (ANALYZE_SELECTION)
- [x] Service worker receives, runs stub engine, stores result in session storage

### Day 3 — Data Prep (March 17)

- [x] Download logical-fallacy dataset from HuggingFace (tasksource/logical-fallacy, 3,761 examples)
- [x] Map labels to 12-category taxonomy (3,453 mapped, 3,217 after dedup)
- [x] Create stratified train/val/test splits (2,573 / 322 / 322)
- [x] Generate train.json, val.json, test.json, label_map.json
- Note: `loaded_question` and `slippery_slope` have 0 examples — may need supplemental data or taxonomy reduction

### Day 4 — Model Training (March 18)

- [x] Fixed train.py: sklearn metrics instead of evaluate package, float cast for learning_rate
- [x] Fine-tuned DistilRoBERTa (5 epochs, ~2.5 min on GPU)
- [x] Ran evaluate.py on test set
- [x] Generated confusion matrix (model/output/evaluation/confusion_matrix.png)
- [x] Saved error analysis (model/output/evaluation/error_analysis.json)
- [x] Best model saved to model/output/best_model/
- Results: **54% accuracy, 45% macro F1** (weighted F1: 54%)
  - Best classes: false_dichotomy (0.68 F1), ad_hominem (0.67), appeal_to_popular_opinion (0.64)
  - Weakest: equivocation (0.42), appeal_to_authority (0.42), begging_the_question (0.45)
  - Empty classes: loaded_question, slippery_slope (no training data)

### Day 5 — ONNX Export + Integration (March 19)

- [x] Exported model to ONNX format via optimum
- [x] Applied INT8 dynamic quantization (328MB → 78.7MB)
- [x] Copied model to extension/public/model/onnx/
- [x] Installed @huggingface/transformers in extension
- [x] Created local-engine.ts with Transformers.js pipeline
- [x] Updated engine.ts factory to use LocalEngine
- [x] Build verified — ONNX Runtime WASM + model bundled in dist/
- [x] End-to-end: highlight → classify → results (reload extension to test)

### Day 6 — Inline UI (March 20)

- [x] Built highlighter.ts — DOM text search, text node wrapping, highlight rendering
- [x] Colored underlines with per-fallacy colors + subtle background tint
- [x] Tooltip component with fallacy name, soft-language explanation, confidence %
- [x] Confidence indicator ("High confidence" / "Moderate confidence" + percentage)
- [x] Hover interaction: tooltip appears above highlighted span, fade-in animation
- [x] Clear highlights function for re-analysis
- [x] Wired into content script: analysis results → inline highlights on page

### Day 7 — Buffer (March 21)

- [x] Catch up on any slipped tasks
- [x] Begin side panel scaffolding
- [x] Stabilize end-to-end local inference
- [x] Build verified — all modules compile cleanly

### Day 8 — Side Panel (March 22)

- [x] Created sidepanel.css with full design system (variables, layout, animations)
- [x] Built SummaryBar component — segment/flagged/detection counts
- [x] Built FallacyBreakdown component — per-type bar chart with color-coded dots
- [x] Built FallacyCard component — fallacy name, confidence badge, quoted text, explanation
- [x] Built EmptyState + LoadingState components (spinner animation)
- [x] Built AnalysisView component — wires summary, breakdown, and cards together
- [x] Rewrote App.tsx — loading state awareness, proper component composition
- [x] Added SCROLL_TO_HIGHLIGHT message type to messaging module
- [x] Added scroll-to-highlight handler in content script (smooth scroll + flash)
- [x] Side panel click-to-scroll: clicking a fallacy card scrolls to the highlighted text on the page
- [x] Build verified — all new components compile and bundle correctly

### Day 9 — Explainability (March 23)

- [x] Added AutoTokenizer initialization alongside classifier pipeline
- [x] Implemented leave-one-out token occlusion attribution in LocalEngine
- [x] Word-level subword merging for RoBERTa BPE tokens (Ġ prefix handling)
- [x] Attribution scores normalized to 0–1, capped at 25 words per segment
- [x] highlightTokens populated on segments with detected fallacies
- [x] Built ExplainabilityView component — token heatmap with color intensity
- [x] Legend showing low→high influence gradient per fallacy color
- [x] Hover tooltip on each token showing attribution percentage
- [x] Wired ExplainabilityView into FallacyCard (renders below explanation)
- [x] Added explainability CSS: token grid, legend, hover outlines
- [x] Build verified — all modules compile cleanly

### Day 10 — Remote Inference (March 24)

**Phase 1: Type System Expansion**
- [x] Expand FallacyType — add appeal_to_emotion, whataboutism, loaded_language, slippery_slope, loaded_question, false_equivalence, circular_reasoning, other
- [x] Add llmLabel?: string to FallacyDetection (raw label for 'other' type)
- [x] Add tokenUsage?: { prompt, completion } to AnalysisResult
- [x] Add FallacyDefinition entries in constants.ts for each new type (name, description, color)
- [x] Expand ExtensionSettings — remoteProvider, ollamaUrl, ollamaModel, remoteModel
- [x] Update DEFAULT_SETTINGS in storage.ts

**Phase 2: Agent Prompt**
- [x] Create prompts.ts — system prompt with full taxonomy, definitions, confidence rubric (high/medium/low), JSON output schema
- [x] buildSystemPrompt() encodes analysis instructions + soft-language tone
- [x] buildUserPrompt(text) wraps user text for analysis
- [x] JSON schema requires: technique, snippet (verbatim), explanation, confidence, trigger_phrases
- [x] TECHNIQUE_NAME_MAP — 35-entry lookup mapping LLM technique name variations to FallacyType

**Phase 3: Remote Engine**
- [x] Create remote-engine.ts implementing InferenceEngine
- [x] Provider dispatch: callOllama(), callOpenAI(), callAnthropic(), callGemini()
- [x] JSON response parser (strip markdown fences, validate schema)
- [x] Fuzzy snippet matching (normalize whitespace, case-insensitive substring, partial matching)
- [x] Technique → FallacyType mapping (fuzzy match or 'other')
- [x] Confidence mapping: high→0.85, medium→0.6, low→0.35
- [x] Trigger phrases → TokenAttribution[] for ExplainabilityView heatmap
- [x] Text chunking (~2000 chars) for context length safety
- [x] Token usage accumulation from API responses
- [x] Update engine.ts factory to create RemoteEngine with settings
- [x] Update service-worker.ts to pass settings + engineOverride
- [x] Update manifest.json — host_permissions for localhost, openai, anthropic, googleapis

**Phase 4: Settings UI + Engine Selection UX**
- [x] Split button in content-script.ts — main click uses default, ▾ chevron opens "Local Model" / "LLM" dropdown
- [x] Dropdown selection runs analysis and updates default engine setting
- [x] Split button + engine dropdown CSS in content.css
- [x] Add engineOverride to ANALYZE_SELECTION/ANALYZE_FULL_PAGE message payloads
- [x] Expand Popup.tsx — default engine toggle, provider dropdown, API key input (masked), Ollama URL/model, test connection
- [x] Full-page analyze split button in popup

**Phase 5: UI Adjustments**
- [x] FallacyCard — handle 'other' type (llmLabel as display name, gray color)
- [x] AnalysisView — show token usage in footer ("~X tokens used")

**Verification**
- [x] Build compiles cleanly
- [x] Ollama test: local LLM → analysis with highlights + side panel
- [x] Cloud test: API key → LLM analysis displays correctly
- [x] Split button: both engine options work from floating button + popup
- [x] Expanded taxonomy: novel techniques render properly
- [x] Fuzzy matching: LLM quotes highlight on page
- [x] Token usage visible in side panel footer
- [x] Settings persist across popup reopens
- [x] Error handling: invalid key / offline Ollama → clear message

### Day 10+ — Bug fixes & Enhancements

- [x] Fix: ExplainabilityView tokens running together (add spaces between words)
- [x] Fix: Floating split button visibility (explicit height + pointer-events)
- [x] Fix: Chevron engine override not being passed to service worker
- [x] Fix: Error handling — errors now stored in session storage + broadcast + 2min timeout
- [x] Fix: 500 error from Ollama now shows clear error message
- [x] Fix: Defensive null checks for segments/fallacies arrays
- [x] Cancel button on loading state (AbortController wired through fetch calls)
- [x] Confidence display: replaced percentage with High/Moderate/Low labels
- [x] Local engine threshold lowered to 0.4 for Moderate detection

### Day 11 — Smart Text Extraction (March 25)

- [x] Smart generic article extractor in Popup.tsx (replaces document.body.innerText)
- [x] Strategy 1: Schema.org JSON-LD articleBody extraction
- [x] Strategy 2: Semantic container selectors (article, main, .entry-content, etc.)
- [x] Strategy 3: Largest text-dense block heuristic
- [x] Strategy 4: Fallback to document.body.innerText
- [x] Skipped site-specific parsers (Twitter/Facebook) — fragile and low-value

### Day 12 — UX Polish (March 26)

- [x] Loading state: elapsed time counter (shows running seconds/minutes)
- [x] Loading state: engine-aware label ("Using LLM" / "Using Local Model")
- [x] Empty state: added tips section (chevron usage, full page, click highlights)
- [x] Confidence threshold slider in popup settings (0-100%, persisted)
- [x] Local engine reads user-configured threshold from storage
- [x] Added CSS for empty state tips
- [x] Build verified

### V2 Model — LLM Distillation Pipeline

- [x] Created generate_distillation_data.py — generates 50 examples/category via Ollama
- [x] Created training_config_v2.yaml — 41-category expanded taxonomy, 8 epochs
- [x] Created train_v2.py — trains DistilRoBERTa on distilled data
- [x] Created evaluate_v2.py — V2 evaluation + V1 vs V2 side-by-side comparison charts
- [x] Created export_onnx_v2.py — ONNX export + INT8 quantization for V2
- [x] Run: generate_distillation_data.py — 2,050 distilled + 200 clean + v1 merged = 4,945 examples
- [x] Run: train_v2.py — 54.7% accuracy, 52.1% macro F1 across 41 categories
- [x] Run: evaluate_v2.py — comparison charts generated (v1_vs_v2_chart.png, v2_new_categories.png)
- [x] Run: export_onnx_v2.py — 80.6MB quantized ONNX model
- [x] Deploy V2 ONNX model to extension

### Cross-Model Evaluation Benchmark

- [x] Created benchmark dataset (model/data/benchmark/benchmark.json) — 35 gold-standard annotated passages
  - 15 clear fallacy examples (single technique, should be detected with high confidence)
  - 5 multi-technique passages (2-4 techniques each, tests multi-detection capability)
  - 10 clean text passages (should NOT be flagged — measures false positive rate)
  - 5 subtle/borderline cases (tests calibration and restraint)
- [x] Created benchmark.py — automated cross-model evaluation script
  - Calls Ollama models (llama3.1:8b, phi3) and optionally Gemini
  - Compares predictions against gold-standard annotations
  - Fuzzy snippet matching with word-level Jaccard overlap
  - Technique name normalization (maps LLM names to canonical types)
  - Generates 6 comparison charts + JSON results
- [x] Run: benchmark.py — cross-model comparison results:

| Model | Precision | Recall | F1 | FP Rate | Tech Accuracy | Avg Latency |
|-------|-----------|--------|----|---------|---------------|-------------|
| **Gemini 2.5 Flash** | **71%** | **97%** | **82%** | 10% | 74% | 5.7s |
| Gemini 2.5 Pro | 60% | 94% | 73% | **0%** | 76% | 13.1s |
| Gemini 3.1 Flash Lite Preview | 60% | 89% | 72% | 10% | 78% | **2.0s** |
| Gemini 3.1 Pro Preview | 59% | 92% | 72% | **0%** | **85%** | 11.8s |
| Gemini 3 Flash Preview | 43% | 89% | 58% | **0%** | 81% | 5.9s |
| OpenAI gpt-5.4-mini | 45% | 89% | 60% | 10% | 69% | 1.7s |
| OpenAI gpt-5.4-nano | 41% | 97% | 58% | 30% | 43% | 2.0s |
| OpenAI gpt-5.4 | 38% | **100%** | 55% | **0%** | 72% | 4.6s |
| phi3 (Ollama) | 69% | 50% | 58% | 10% | 39% | 4.6s |
| Local V2 DistilRoBERTa | **78%** | 39% | 52% | 40% | 50% | **0.0s** |
| llama3.1:8b (Ollama) | 36% | 72% | 48% | 80% | 38% | 13.1s |
| OpenAI gpt-5 / gpt-5-mini / gpt-5-nano | 0% | 0% | 0% | 0% | 0% | 0.4s |

**Key findings:**
- **Gemini 2.5 Flash** remains the best overall with 82% F1, combining high recall (97%) with good precision (71%).
- **Gemini 3.x models** have the best technique accuracy (78-85%) — they correctly identify *which* fallacy is present more reliably than any other model, despite lower precision.
- **Gemini 2.5 Pro, 3.1 Pro Preview, and 3 Flash Preview** achieve 0% false positive rate — they never flag clean text.
- **OpenAI gpt-5.4** achieves perfect recall (100%) with 0% FP rate but lower precision (38%) — it detects everything but over-splits into too many detections.
- **OpenAI gpt-5.4-mini** offers the best OpenAI precision-recall balance (45%/89%, F1=60%) and is the fastest cloud model (1.7s).
- **OpenAI gpt-5 generation** (gpt-5, gpt-5-mini, gpt-5-nano) returned 0% across all metrics — these older models appear to not support the JSON output format required by the benchmark.
- **Local V2 DistilRoBERTa** has the highest precision (78%) and is instant, but low recall (39%).
- **phi3 (Ollama)** improved significantly vs. previous runs: 69% precision, 10% FP rate — the most conservative LLM option.
- **Speed tier**: Local (0s) → OpenAI 5.4 nano/mini (~2s) → Gemini Flash (~2-6s) → phi3/Ollama (~5s) → Pro models (~11-13s).

Charts generated:
- `model/output/benchmark/precision_recall_f1.png`
- `model/output/benchmark/false_positive_rate.png`
- `model/output/benchmark/technique_accuracy.png`
- `model/output/benchmark/latency.png`
- `model/output/benchmark/recall_by_category.png`
- `model/output/benchmark/radar_summary.png`

### V3 Model — DeBERTa-v3-large

- [x] Created training_config_v3.yaml — DeBERTa-v3-large, batch 4 x 4 grad accum, lr 1e-5, fp16
- [x] Created train_v3.py — DeBERTa-v3-large training script (reuses v2 data)
- [x] Created export_onnx_v3.py — ONNX export + INT8 quantization for V3
- [x] Run: train_v3.py — 55.5% accuracy, 51.4% macro F1 across 41 categories
- [x] Run: export_onnx_v3.py — 641.9MB quantized ONNX model

**V3 Results & Issues:**
- **Accuracy**: 55.5% accuracy / 51.4% F1 — only marginally better than V2 (54.7% / 52.1%). The bottleneck is training data quality/size, not model capacity.
- **Size**: 641.9MB quantized (vs 80.6MB for V2) — **too large for browser extension bundling**. DeBERTa-v3-large is 8x the size of DistilRoBERTa.
- **Quantization parity**: Very poor — INT8 quantization severely degrades DeBERTa-v3-large predictions (1/5 parity on test texts). DeBERTa's architecture is more sensitive to quantization than RoBERTa.
- **Conclusion**: DeBERTa-v3-large is not practical for this use case. The model is too large to bundle and quantization destroys quality. **Recommendation**: Use `deberta-v3-base` (86M params, similar size to DistilRoBERTa) or invest in better training data rather than a larger model.

## Files Created

*(Updated as files are created)*

### Extension
- `extension/manifest.json`
- `extension/package.json`
- `extension/tsconfig.json`
- `extension/vite.config.ts`
- `extension/src/shared/types.ts`
- `extension/src/shared/constants.ts`
- `extension/src/shared/messaging.ts`
- `extension/src/shared/storage.ts`
- `extension/src/background/service-worker.ts`
- `extension/src/background/inference/engine.ts`
- `extension/src/background/inference/types.ts`
- `extension/src/content/content-script.ts`
- `extension/src/popup/index.html`
- `extension/src/popup/Popup.tsx`
- `extension/src/popup/main.tsx`
- `extension/src/sidepanel/index.html`
- `extension/src/sidepanel/App.tsx`
- `extension/src/sidepanel/main.tsx`
- `extension/src/sidepanel/sidepanel.css`
- `extension/src/sidepanel/AnalysisView.tsx`
- `extension/src/sidepanel/FallacyCard.tsx`
- `extension/src/sidepanel/SummaryBar.tsx`
- `extension/src/sidepanel/EmptyState.tsx`
- `extension/src/sidepanel/ExplainabilityView.tsx`
- `extension/src/styles/content.css`

#### Day 10
- `extension/src/background/inference/prompts.ts`
- `extension/src/background/inference/remote-engine.ts`

### Model Training
- `model/requirements.txt`
- `model/configs/training_config.yaml`
- `model/configs/training_config_v2.yaml`
- `model/scripts/generate_distillation_data.py`
- `model/scripts/train_v2.py`
- `model/scripts/evaluate_v2.py`
- `model/scripts/export_onnx_v2.py`

---

## Notes

- Using Vite + CRXJS for extension build tooling
- React for popup and side panel UI
- TypeScript throughout the extension codebase
- Privacy-first: local inference by default

---

## Future Improvements (Post-Timeline)

The following improvements are beyond the current 2-week scope but represent the highest-impact directions for future development.

### Model Quality

- [ ] **Human-annotated training data** — Replace LLM-distilled data with 2,000–5,000 expert-annotated passages from real news articles, opinion pieces, and social media. Include inter-annotator agreement scores.
- [ ] **Multi-task learning** — Train a single model with multiple heads (claim detection + fallacy classification + confidence calibration) instead of separate models. Shared representations improve all tasks.
- [ ] **Larger base model** — Upgrade from DistilRoBERTa (82M) to DeBERTa-v3-large (304M). With ONNX quantization still viable for in-browser inference (~150MB).

### Architecture — Multi-Stage Pipeline

- [ ] **Context Analyzer** — Consider surrounding paragraphs, article headline, and source metadata to reduce false positives
- [ ] **Fact Retrieval** — For claims like "crime increased 300%," retrieve actual data to assess Post Hoc and Cherry Picking
- [ ] **Ensemble local + LLM** — Run both engines in parallel and merge results. Agreement = high confidence. Disagreement = surface for user review.

### RAG — Dynamic Few-Shot + Knowledge Base

- [ ] **Dynamic few-shot retrieval** — Embed annotated corpus in a vector store. Retrieve the 3 most semantically similar examples as few-shot context at analysis time.
- [ ] **Source credibility database** — Knowledge base of publication bias ratings (AllSides, Media Bias/Fact Check). Include source context when analyzing text from known publications.
- [ ] **Technique evolution tracking** — Continuously updated technique database for emerging rhetoric patterns (ragebait, engagement farming), retrieved via RAG.

### Evaluation

- [ ] **Evaluation benchmark** — 200+ passages with gold-standard expert annotations. Measure precision/recall per technique, false positive rate on clean text, snippet accuracy, and cross-model comparison.
- [ ] **A/B testing framework** — Let users flag false positives/negatives. Over time becomes training data and a real-world accuracy metric.

### UX — From Tool to Learning Platform

- [ ] **Argument mapping** — Visualize argument structure (premises, conclusions, logic breaks). Teaches critical thinking, not just pattern recognition.
- [ ] **"Steelman" mode** — For each detected fallacy, generate a stronger version of the argument without manipulative techniques.
- [ ] **Cross-article comparison** — Find the same story from other sources, highlight how different outlets frame it differently.
- [ ] **Difficulty calibration** — Track which techniques the user spots and surface unfamiliar ones. Spaced repetition for critical thinking.

### Infrastructure

- [ ] **Streaming responses** — Switch to streaming for Ollama and cloud providers. Parse and render detections incrementally (5–10s vs. 30–60s wait).
- [ ] **Caching** — Hash analyzed text and cache results in IndexedDB. Re-analyzing the same article should be instant.
- [ ] **Browser-native LLM** — Chrome's built-in AI APIs (Prompt API, on-device Gemini Nano) would eliminate Ollama dependency entirely.
