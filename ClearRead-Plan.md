# ClearRead — Rhetorical Analysis Browser Extension

## Project Plan

**Author:** Solo developer
**Timeline:** 2 weeks (March 15 – March 29, 2026)
**Platform:** Chrome / Edge (Manifest V3)
**GPU:** Local GPU available for model training

---

## 1. Vision

A browser extension that helps users think critically about what they read online. When a user highlights text on any webpage — news articles, tweets, Facebook posts — the extension analyzes it for rhetorical techniques and logical fallacies. Rather than labeling content "fake" or "false," it uses soft, educational language to explain *how* the text is framed and *why* the user might want to seek additional sources.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────┐
│  Browser Extension (Manifest V3)                │
│                                                 │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐ │
│  │ Content   │  │ Background│  │ Side Panel   │ │
│  │ Script    │←→│ Service   │←→│ (React)      │ │
│  │ (highlight│  │ Worker    │  │              │ │
│  │  + inline)│  │           │  │ Detailed     │ │
│  └──────────┘  └─────┬─────┘  │ Analysis     │ │
│                      │        └──────────────┘ │
│                      ▼                          │
│         ┌────────────────────────┐              │
│         │  Inference Engine      │              │
│         │  ┌──────────────────┐  │              │
│         │  │ Local (ONNX /    │  │              │
│         │  │ Transformers.js) │  │              │
│         │  └──────────────────┘  │              │
│         │  ┌──────────────────┐  │              │
│         │  │ Remote (user API │  │              │
│         │  │ key → OpenAI/HF) │  │              │
│         │  └──────────────────┘  │              │
│         └────────────────────────┘              │
└─────────────────────────────────────────────────┘
```

### Core Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Extension shell | Manifest V3, TypeScript | Chrome/Edge extension infrastructure |
| Content script | DOM parsing, highlight injection | Captures selected text, renders inline annotations |
| Background service worker | Chrome Service Worker API | Routes messages, orchestrates inference |
| Side panel | React + TypeScript | Detailed analysis view, full-article mode |
| Popup | React + TypeScript | Quick status, "Analyze Full Page" button, settings |
| Local inference | Transformers.js / ONNX Runtime Web | In-browser model inference (privacy-preserving) |
| Remote inference | OpenAI / HF Inference API | Optional upgrade path via user-provided API key |
| Model training | PyTorch, HuggingFace Transformers | Fine-tune DistilRoBERTa for fallacy classification |

---

## 3. Interaction Design

### User-Initiated Flow

1. User highlights text on any webpage
2. A small floating button appears near the selection: **"Analyze with ClearRead"**
3. On click, the extension sends the text to the inference engine
4. **Inline result:** Sentences with detected fallacies are highlighted with colored underlines; hovering shows a tooltip with:
   - The fallacy name
   - A soft-language explanation
   - A confidence indicator
   - A "Learn more" link
5. **Side panel (optional):** User clicks "See Full Analysis" to open a side panel showing:
   - All detected fallacies with explanations
   - Token-level explainability (which words triggered the classification)
   - Overall assessment in plain language
   - Suggestion to seek additional sources

### Full-Page Mode

- User clicks the extension icon → popup with "Analyze Full Page" button
- Extension extracts article body (using site-specific parsers or generic extraction)
- Results displayed in the side panel

---

## 4. Fallacy Taxonomy (12 Categories)

| # | Fallacy | Short Description | Soft-Language Template |
|---|---------|-------------------|----------------------|
| 1 | **Straw Man** | Misrepresenting someone's argument to make it easier to attack | *"This passage appears to simplify or misrepresent an opposing position. Consider checking the original source to see the full argument."* |
| 2 | **Begging the Question** | Assuming the conclusion within the premise | *"The reasoning here may assume the very thing it's trying to prove. Look for independent evidence that supports this claim."* |
| 3 | **Ad Hominem** | Attacking the person rather than the argument | *"This passage focuses on the person rather than their argument. Consider whether the underlying claim has merit regardless of who said it."* |
| 4 | **Post Hoc (False Cause)** | Assuming causation from correlation or sequence | *"This suggests one event caused another, but the connection may not be established. Consider whether other factors could explain this."* |
| 5 | **Loaded Question** | A question that presupposes something unproven | *"This question may contain an assumption that hasn't been established. Consider whether you agree with the premise before engaging with the question."* |
| 6 | **False Dichotomy** | Presenting only two options when more exist | *"This presents a limited set of choices. Consider whether there are other options or middle-ground positions not mentioned."* |
| 7 | **Equivocation** | Using a word with multiple meanings ambiguously | *"A key term here may be used in more than one sense, which could make the argument seem stronger than it is. Consider how the term is defined."* |
| 8 | **Appeal to Authority** | Using an authority figure's opinion as proof | *"This relies on someone's authority or credentials rather than evidence. Consider whether the cited authority is relevant to this specific topic."* |
| 9 | **Hasty Generalization** | Drawing broad conclusions from limited examples | *"This draws a broad conclusion from a limited number of examples. Consider whether the evidence is representative of the larger picture."* |
| 10 | **Appeal to Popular Opinion** | Arguing something is true because many believe it | *"This suggests something is true because it's widely believed. Popular opinion doesn't always align with evidence — consider looking at the underlying data."* |
| 11 | **Slippery Slope** | Arguing that one event will inevitably lead to extreme consequences | *"This suggests a chain of consequences that may not be inevitable. Consider whether each step in the chain is actually likely."* |
| 12 | **Red Herring** | Introducing an irrelevant topic to divert attention | *"This may introduce a topic that diverts from the main issue. Consider whether this point is directly relevant to the original discussion."* |

### 4.1 Expanded Taxonomy (LLM Mode)

When using the LLM-powered remote engine, the system can detect techniques beyond the 12 trained classifier labels. Additional types supported in LLM mode:

| # | Technique | Short Description | Soft-Language Template |
|---|-----------|-------------------|------------------------|
| 13 | **Appeal to Emotion** | Using emotional manipulation instead of logical argument | *"This passage may rely on emotional appeal rather than evidence. Consider whether the underlying claim stands on its own merits."* |
| 14 | **Whataboutism** | Deflecting criticism by pointing to someone else's behavior | *"This may deflect from the issue by pointing to another party's actions. Consider whether the original concern is still valid regardless."* |
| 15 | **Loaded Language** | Using emotionally charged words to influence perception | *"The language here may be chosen to evoke a strong emotional response. Consider how more neutral phrasing might change your perception."* |
| 16 | **False Equivalence** | Treating two very different things as if they're the same | *"This may equate two situations that differ in important ways. Consider whether the comparison is fair given the differences."* |
| 17 | **Circular Reasoning** | Using the conclusion as a premise in the argument | *"The reasoning here may be circular — the conclusion may be restated as evidence. Look for independent support for this claim."* |
| 18 | **Other** *(catch-all)* | Novel technique identified by LLM not in the standard taxonomy | *(LLM provides custom explanation)* |

The `other` type acts as a catch-all: when the LLM identifies a rhetorical technique not in the taxonomy, it is preserved with the LLM's raw label (`llmLabel`) and rendered with a neutral gray color in the UI.

---

## 5. Model Training Plan

### 5.1 Model Selection

- **Base model:** `distilroberta-base` (82M parameters)
  - Good accuracy-to-size ratio
  - ONNX-exported: ~330MB; INT8 quantized: ~85MB (viable for extension bundling)
  - Well-supported by Transformers.js

### 5.2 Datasets

| Dataset | Source | Use |
|---------|--------|-----|
| **Logical Fallacy Detection** | [HuggingFace: argilla/logical-fallacies](https://huggingface.co/datasets/argilla/logical-fallacies) | Direct fallacy labels — primary training data |
| **Propaganda Techniques Corpus** | [SemEval 2020 Task 11](https://propaganda.qcri.org/) | Propaganda techniques that map to several of the 12 fallacy categories |
| **LIAR** | [University of Victoria](https://www.cs.ucsb.edu/~william/data/liar_dataset.zip) | 6-class credibility labels — supplementary signal (stretch goal) |

### 5.3 Category Mapping

Both datasets use different taxonomies. A mapping script will consolidate them into the 12 target labels:

| Source Label (examples) | → Target Label |
|------------------------|----------------|
| Straw Man (Logical Fallacies) | Straw Man |
| Misrepresentation (Propaganda) | Straw Man |
| Name Calling, Labeling (Propaganda) | Ad Hominem |
| Causal Oversimplification (Propaganda) | Post Hoc |
| Black-and-White Fallacy (Propaganda) | False Dichotomy |
| Appeal to Authority (Propaganda) | Appeal to Authority |
| Bandwagon (Propaganda) | Appeal to Popular Opinion |
| Red Herring (Propaganda) | Red Herring |
| Exaggeration (Propaganda) | Hasty Generalization |
| *...additional mappings in prepare_data.py* | |

### 5.4 Training Configuration

```yaml
model_name: distilroberta-base
num_labels: 12
max_length: 256
batch_size: 16
learning_rate: 2e-5
epochs: 5
warmup_ratio: 0.1
weight_decay: 0.01
evaluation_strategy: epoch
metric_for_best_model: f1_macro
```

### 5.5 Training Pipeline

1. **Data preparation** (`prepare_data.py`) — Clean, deduplicate, map labels, stratified train/val/test split (80/10/10)
2. **Training** (`train.py`) — Fine-tune with HuggingFace Trainer, early stopping based on validation F1
3. **Evaluation** (`evaluate.py`) — Confusion matrix, per-class precision/recall/F1, error analysis
4. **Export** (`export_onnx.py`) — Convert to ONNX, apply INT8 quantization, validate output parity

### 5.6 Explainability

- **Method:** Attention rollout or Integrated Gradients (via Captum)
- **Output:** Per-token attribution scores indicating which words most influenced the prediction
- **Display:** Highlighted trigger words in the side panel, intensity mapped to attribution score

---

## 6. Inference Abstraction

The inference layer is designed for extensibility — swap local for remote without touching the rest of the codebase.

```typescript
interface InferenceEngine {
  analyze(text: string): Promise<AnalysisResult>;
  isAvailable(): Promise<boolean>;
}

interface AnalysisResult {
  segments: SegmentAnalysis[];
  overallAssessment: string;     // soft-language summary
  timestamp: number;             // for future persistence
  source: 'local' | 'remote';   // which engine was used
  tokenUsage?: {                 // LLM token usage (remote only)
    prompt: number;
    completion: number;
  };
}

interface SegmentAnalysis {
  text: string;
  fallacies: FallacyDetection[];
  highlightTokens?: TokenAttribution[];
}

interface FallacyDetection {
  type: FallacyType;             // taxonomy category (incl. 'other')
  confidence: number;            // 0.0 – 1.0
  explanation: string;           // soft-language, human-readable
  llmLabel?: string;             // raw LLM label when type is 'other'
}

interface TokenAttribution {
  token: string;
  score: number;                 // attribution weight
}
```

### Confidence Handling

**Local engine (classifier):**
- Default threshold: **0.6** (configurable in settings)
- Below threshold: not displayed to user
- 0.6–0.8: displayed with "may" language
- 0.8+: displayed with slightly more confident language (still soft)

**Remote engine (LLM):**
- LLM self-rates confidence using a rubric: **High** (clear textbook example), **Medium** (plausible, could be read differently), **Low** (subtle or borderline)
- Mapped to numeric values: High → 0.85, Medium → 0.6, Low → 0.35
- No threshold filtering — all detections shown so the user can decide based on the LLM's explanation

### 6.1 LLM-Powered Remote Engine

The remote engine sends the user's text along with a structured **agent prompt** to an LLM. The prompt encodes:
- The full fallacy/propaganda taxonomy with definitions and examples
- Analysis instructions (identify techniques, quote verbatim snippets, explain in educational tone)
- A confidence rubric (high/medium/low)
- A strict JSON output schema

**Supported providers:**

| Provider | Use Case | Endpoint |
|----------|----------|----------|
| **Ollama** | Local LLM testing (free, private) | `http://localhost:11434/api/generate` |
| **OpenAI** | Cloud inference (GPT-4o, etc.) | `https://api.openai.com/v1/chat/completions` |
| **Anthropic** | Cloud inference (Claude) | `https://api.anthropic.com/v1/messages` |
| **Google Gemini** | Cloud inference (Gemini) | `https://generativelanguage.googleapis.com/v1beta/...` |

**LLM JSON output schema:**
```json
{
  "detections": [
    {
      "technique": "Ad Hominem",
      "snippet": "exact verbatim quote from the text",
      "explanation": "Educational, soft-language explanation",
      "confidence": "high",
      "trigger_phrases": ["key phrase 1", "key phrase 2"]
    }
  ],
  "overall_assessment": "Soft-language summary of findings"
}
```

**Key design decisions:**
- **Fuzzy snippet matching:** LLMs frequently alter whitespace, punctuation, or casing when quoting. The engine normalizes whitespace and performs case-insensitive substring search to map LLM quotes back to the original text for inline highlighting.
- **Trigger phrases → heatmap:** The LLM returns 3-5 key trigger phrases per detection, which are converted to `TokenAttribution[]` for the ExplainabilityView heatmap — replacing the occlusion-based attribution used by the local engine.
- **Text chunking:** Long texts (full-page analysis) are split into ~2000-character segments to stay within model context limits. Results are merged.
- **Token usage tracking:** API responses include token counts, displayed in the side panel footer ("~X tokens used").

### 6.2 Engine Selection UX

The user chooses between Local Model and LLM via a **split button** pattern:

**Floating button (content script):**
- Main area: `🔍 Analyze with ClearRead` — uses the default engine from settings
- Small `▾` chevron on the right — opens a dropdown: "🧠 Use Local Model" / "🤖 Use LLM"
- Selecting from the dropdown runs the analysis and updates the default for next time

**Popup (full-page analyze):**
- Same split button pattern for the "Analyze Full Page" button
- Settings section below for provider configuration

**Message flow:**
- `ANALYZE_SELECTION` and `ANALYZE_FULL_PAGE` payloads include an optional `engineOverride?: 'local' | 'remote'`
- Service worker uses the override if present, otherwise falls back to the configured default

---

## 7. Future Persistence Hook

Currently ephemeral — no data stored between sessions. The architecture supports future persistence:

```typescript
interface AnalysisStore {
  save(result: AnalysisResult & { url: string }): Promise<void>;
  getByUrl(url: string): Promise<AnalysisResult[]>;
  getRecent(limit: number): Promise<AnalysisResult[]>;
  clear(): Promise<void>;
}
```

- **Phase 1 (now):** No-op implementation (all methods are stubs)
- **Phase 2 (future):** `chrome.storage.local` or IndexedDB
- **Phase 3 (future):** Optional backend sync

---

## 8. Project Structure

```
clearread/
├── extension/                  # Browser extension
│   ├── manifest.json           # Manifest V3
│   ├── src/
│   │   ├── background/
│   │   │   ├── service-worker.ts
│   │   │   └── inference/
│   │   │       ├── engine.ts          # InferenceEngine factory
│   │   │       ├── local-engine.ts    # ONNX / Transformers.js
│   │   │       ├── remote-engine.ts   # LLM-based (Ollama/OpenAI/Anthropic/Gemini)
│   │   │       ├── prompts.ts         # Agent system prompt + JSON schema
│   │   │       └── types.ts
│   │   ├── content/
│   │   │   ├── content-script.ts      # Text selection listener
│   │   │   ├── highlighter.ts         # Inline annotation rendering
│   │   │   └── parsers/
│   │   │       ├── generic.ts         # Generic text extraction
│   │   │       ├── twitter.ts         # X/Twitter-specific
│   │   │       ├── facebook.ts        # Facebook-specific
│   │   │       └── news.ts            # News article parser
│   │   ├── sidepanel/
│   │   │   ├── index.html
│   │   │   ├── App.tsx
│   │   │   ├── components/
│   │   │   │   ├── AnalysisSummary.tsx
│   │   │   │   ├── FallacyCard.tsx
│   │   │   │   ├── ExplainabilityView.tsx
│   │   │   │   └── ConfidenceMeter.tsx
│   │   │   └── styles/
│   │   ├── popup/
│   │   │   ├── index.html
│   │   │   ├── Popup.tsx
│   │   │   └── Settings.tsx
│   │   ├── shared/
│   │   │   ├── constants.ts           # Fallacy definitions & templates
│   │   │   ├── messaging.ts           # Chrome message types
│   │   │   └── storage.ts             # chrome.storage wrapper
│   │   └── styles/
│   │       └── content.css
│   ├── public/
│   │   └── icons/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── tests/
│
├── model/                      # Model training (Python)
│   ├── data/
│   │   ├── raw/
│   │   └── processed/
│   ├── notebooks/
│   │   └── train_fallacy_classifier.ipynb
│   ├── scripts/
│   │   ├── prepare_data.py
│   │   ├── train.py
│   │   ├── evaluate.py
│   │   └── export_onnx.py
│   ├── requirements.txt
│   └── configs/
│       └── training_config.yaml
│
└── docs/
    └── fallacy_definitions.md
```

---

## 9. Two-Week Schedule (Solo)

### Week 1: Core Infrastructure + Model Training

| Day | Focus | Tasks | Deliverable |
|-----|-------|-------|-------------|
| **Day 1** (Mar 15) | Setup | Project scaffolding, Manifest V3, Vite build config, dev tooling | Extension loads in Chrome, "Hello World" popup |
| **Day 2** (Mar 16) | Content Script | Text selection listener, floating "Analyze" button, message passing to service worker | Highlight text → button appears → text logged in service worker |
| **Day 3** (Mar 17) | Data Prep | Download datasets, write `prepare_data.py`, map to 12 categories, create splits | Clean `train.json`, `val.json`, `test.json` |
| **Day 4** (Mar 18) | Model Training | Fine-tune DistilRoBERTa, evaluate, iterate on hyperparams | Best checkpoint saved, metrics logged |
| **Day 5** (Mar 19) | ONNX Export + Integration | Export model to ONNX, quantize, integrate Transformers.js in service worker | Highlight → classify → results in console |
| **Day 6** (Mar 20) | Inline UI | Build highlighter.ts — colored underlines, tooltips with soft-language explanations | Inline annotations visible on page |
| **Day 7** (Mar 21) | Buffer / Catch-up | Handle anything that slipped; begin side panel scaffolding | Stable end-to-end local inference with inline UI |

### Week 2: Side Panel, Polish, Extensibility

| Day | Focus | Tasks | Deliverable |
|-----|-------|-------|-------------|
| **Day 8** (Mar 22) | Side Panel | React side panel, `AnalysisSummary`, `FallacyCard` components | Side panel shows analysis results |
| **Day 9** (Mar 23) | Explainability | Add attention-based token attribution, `ExplainabilityView` component | Trigger words highlighted in side panel |
| **Day 10** (Mar 24) | Remote Inference | LLM agent prompt, `remote-engine.ts` (Ollama/OpenAI/Anthropic/Gemini), split button UX, settings UI, expanded taxonomy, fuzzy snippet matching, token usage | LLM-powered analysis with split button engine selection |
| **Day 11** (Mar 25) | Site Parsers | Twitter/X, Facebook, news site parsers; full-page extraction | Reliable text extraction on target sites |
| **Day 12** (Mar 26) | UX Polish | Loading states, error handling, confidence threshold slider, edge cases | Polished user experience |
| **Day 13** (Mar 27) | Testing | Manual testing across sites, unit tests for inference layer and parsers | Test coverage on critical paths |
| **Day 14** (Mar 28-29) | Finalize | Bug fixes, packaging, README, demo preparation | Submission-ready extension |

---

## 10. Key Design Principles

1. **Soft, educational tone** — Never accusatory. Always suggest, never assert. Frame as "here's something to consider" not "this is wrong."

2. **Transparency** — Show confidence scores. Let users understand the model isn't perfect. Include "What is this?" explanations for each fallacy.

3. **Privacy-first** — Local inference by default. Remote inference is opt-in and requires the user's own API key. No data sent anywhere without explicit action.

4. **Extensible** — Inference engine interface allows swapping models. Storage interface allows adding persistence. Parser system allows adding new sites.

5. **Minimal disruption** — The extension only activates when the user initiates it. No auto-scanning, no unsolicited notifications.

---

## 11. Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Extension | TypeScript, Manifest V3 |
| Build | Vite + CRXJS |
| UI Framework | React |
| Local Inference | Transformers.js / ONNX Runtime Web |
| Remote Inference | Ollama (local LLM) / OpenAI / Anthropic / Google Gemini |
| Model | DistilRoBERTa (fine-tuned) |
| Training | PyTorch, HuggingFace Transformers, Captum |
| Datasets | Logical Fallacies (HF), Propaganda Techniques Corpus |
| Explainability | Attention rollout / Integrated Gradients |

---

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Model accuracy too low on 12 classes | Core feature degraded | Reduce to 6-8 most separable classes; merge similar categories; LLM mode as higher-quality alternative |
| ONNX model too large for extension | Can't bundle locally | Aggressive quantization; host model on CDN and download on first use |
| Transformers.js inference too slow | Poor UX | Show loading indicator; process sentences in batches; offer remote inference as faster alternative |
| Content script breaks on site updates | Extension fails silently | Generic fallback parser; error boundaries in UI |
| Solo developer time pressure | Features cut | Prioritize: core pipeline > inline UI > side panel > site parsers > settings |
| LLM returns invalid JSON | Remote analysis fails | Strip markdown fences, validate schema, fallback to raw text parsing |
| LLM snippets don't match page text | Highlights fail to render | Fuzzy matching: normalize whitespace, case-insensitive substring search |
| LLM hallucinates techniques | False positives shown to user | LLM confidence rubric + user-visible confidence badge; soft language framing |
| API key leaked or misused | Security risk | Keys stored in chrome.storage.local (never synced); never logged; never sent to non-API endpoints |
| Context window overflow on long pages | Analysis truncated | Chunk text into ~2000-char segments; merge results |

---

## 13. Multi-Model Pipeline (Future)

The current plan uses a single model for simplicity. A future multi-model pipeline would chain specialized models:

1. **Claim Detector** — Identifies which sentences are claims vs. neutral reporting (binary classifier)
2. **Fallacy Classifier** — Classifies claims into the 12 fallacy categories (the current model)
3. **Framing/Sentiment Model** — Detects emotional tone and manipulation techniques
4. **Veracity Model** — Cross-references claims against known facts (FEVER-style retrieval + entailment)

Benefits: Each model is smaller, more accurate at its specific task, and can be upgraded independently.
Tradeoff: Higher latency (multiple inference passes), more complexity. Not viable in 2 weeks solo.

The `InferenceEngine` interface is designed so this pipeline can be implemented as a new engine class without changing the rest of the codebase.

---

## 14. Future Improvements (Post-Timeline)

The following improvements are beyond the current 2-week scope but represent the highest-impact directions for future development.

### 14.1 Model Quality

| Improvement | Description | Impact |
|-------------|-------------|--------|
| **Human-annotated training data** | Replace LLM-distilled training data with 2,000–5,000 expert-annotated passages from real news articles, opinion pieces, and social media. Include inter-annotator agreement scores. | High — eliminates teacher model bias |
| **Multi-task learning** | Train a single model with multiple heads (claim detection + fallacy classification + confidence calibration) instead of separate models. Shared representations improve all tasks. | High — better accuracy, simpler pipeline |
| **Larger base model** | Upgrade from DistilRoBERTa (82M) to DeBERTa-v3-large (304M). With ONNX quantization still viable for in-browser inference (~150MB). | Medium — significant NLU accuracy gains |

### 14.2 Architecture — Multi-Stage Pipeline

Expand the pipeline from Section 13 with additional stages:

1. **Claim Detector** → filters neutral reporting (partially implemented)
2. **Fallacy Classifier** → classifies claims into techniques
3. **Context Analyzer** → considers surrounding paragraphs, article headline, and source metadata to reduce false positives
4. **Fact Retrieval** → for claims like "crime increased 300%," retrieve actual data to assess Post Hoc and Cherry Picking

**Ensemble local + LLM:** Run both engines in parallel and merge results. Local model provides speed and catches obvious patterns; LLM catches subtle/novel techniques. Agreement between both = high confidence. Disagreement = surface for user review.

### 14.3 RAG — Dynamic Few-Shot + Knowledge Base

| Component | Description |
|-----------|-------------|
| **Dynamic few-shot retrieval** | Embed the annotated training corpus in a vector store. At analysis time, retrieve the 3 most semantically similar examples as few-shot context (replacing static examples in the prompt). |
| **Source credibility database** | Maintain a knowledge base of publication bias ratings (e.g., AllSides, Media Bias/Fact Check). Include source context when analyzing text from known publications. |
| **Technique evolution tracking** | Continuously updated technique database for emerging rhetoric patterns (ragebait, engagement farming, etc.), retrieved via RAG instead of a fixed taxonomy. |

### 14.4 Evaluation — Measuring What Matters

| Metric | Description |
|--------|-------------|
| **Proper evaluation benchmark** | 200+ passages with gold-standard expert annotations. Measure precision/recall per technique, false positive rate on clean text, snippet accuracy, and cross-model comparison (local vs. Ollama vs. Gemini vs. GPT-4o). |
| **A/B testing framework** | Let users flag false positives/negatives. Over time this becomes training data and a real-world accuracy metric. |

### 14.5 UX — From Tool to Learning Platform

| Feature | Description |
|---------|-------------|
| **Argument mapping** | Visualize argument structure — premises, conclusions, and where logic breaks down. Teaches critical thinking, not just pattern recognition. |
| **"Steelman" mode** | For each detected fallacy, generate what a stronger version of the argument would look like — showing how the same point could be made without manipulative techniques. |
| **Cross-article comparison** | Automatically find the same story from other sources and highlight how different outlets frame it differently. Teaches media literacy. |
| **Difficulty calibration** | Track which techniques the user has learned to spot and focus on surfacing unfamiliar ones. Spaced repetition for critical thinking. |

### 14.6 Infrastructure

| Improvement | Description |
|-------------|-------------|
| **Streaming responses** | Switch from `stream: false` to streaming for Ollama and cloud providers. Parse detections as they arrive and render incrementally (5–10s vs. 30–60s wait). |
| **Caching** | Hash analyzed text and cache results in IndexedDB. Re-analyzing the same article should be instant. |
| **Browser-native LLM** | Chrome's built-in AI APIs (Prompt API, on-device Gemini Nano) would eliminate the Ollama dependency entirely — LLM runs in the browser with no setup required. |