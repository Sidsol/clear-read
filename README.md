# ClearRead

A Chrome/Edge browser extension that helps users think critically about what they read online. Highlight any text on a webpage — news articles, tweets, posts — and ClearRead analyzes it for rhetorical techniques and logical fallacies using on-device AI or cloud LLMs.

Rather than labeling content as "fake" or "false," ClearRead uses soft, educational language to explain *how* text is framed and *why* users might want to seek additional sources.

![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)
![React](https://img.shields.io/badge/React-18-61dafb)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Highlight-to-Analyze** — Select any text on a webpage and click "Analyze with ClearRead" to detect fallacies inline
- **Full-Page Analysis** — Analyze an entire article with one click from the popup, using smart text extraction (Schema.org JSON-LD, semantic containers, largest text-dense block)
- **Inline Highlighting** — Detected fallacies appear as colored underlines directly on the page with hover tooltips showing the fallacy name, explanation, and confidence level
- **Side Panel** — Detailed analysis view with summary statistics, per-fallacy cards, and click-to-scroll navigation back to highlighted text
- **Explainability Heatmap** — Token-level attribution shows which words most influenced each detection, rendered as a color-intensity heatmap
- **Dual Inference Engines** — Switch between local (on-device) and remote (LLM) analysis via a split button
- **Privacy-First Local Model** — Fine-tuned DistilRoBERTa runs entirely in the browser via ONNX Runtime / Transformers.js — no data leaves the device
- **Multi-Provider LLM Support** — Connect your own API key for OpenAI, Anthropic, Google Gemini, or use a local Ollama instance
- **Configurable Confidence Threshold** — Adjust detection sensitivity from the popup settings
- **41-Category Taxonomy** — The LLM engine detects an expanded set of rhetorical techniques beyond the 12 core fallacy types

## Fallacy Taxonomy

The local classifier detects **12 core fallacy types**:

| Fallacy | Description |
|---------|-------------|
| Straw Man | Misrepresenting someone's argument to make it easier to attack |
| Begging the Question | Assuming the conclusion within the premise |
| Ad Hominem | Attacking the person rather than the argument |
| Post Hoc (False Cause) | Assuming causation from correlation or sequence |
| Loaded Question | A question that presupposes something unproven |
| False Dichotomy | Presenting only two options when more exist |
| Equivocation | Using a word with multiple meanings ambiguously |
| Appeal to Authority | Using an authority figure's opinion as proof |
| Hasty Generalization | Drawing broad conclusions from limited examples |
| Appeal to Popular Opinion | Arguing something is true because many believe it |
| Slippery Slope | Arguing one event will inevitably lead to extreme consequences |
| Red Herring | Introducing an irrelevant topic to divert attention |

The **LLM engine** additionally detects: Appeal to Emotion, Whataboutism, Loaded Language, False Equivalence, Circular Reasoning, and more — with an `other` catch-all for novel techniques.

## Architecture

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
│         │  │ key → LLM)      │  │              │
│         │  └──────────────────┘  │              │
│         └────────────────────────┘              │
└─────────────────────────────────────────────────┘
```

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Extension shell | Manifest V3, TypeScript | Chrome/Edge extension infrastructure |
| Content script | DOM manipulation | Text selection, floating button, inline annotations |
| Background worker | Chrome Service Worker | Message routing, inference orchestration |
| Side panel | React + TypeScript | Detailed analysis view with fallacy cards |
| Popup | React + TypeScript | Quick actions, settings, full-page analysis |
| Local inference | Transformers.js / ONNX Runtime Web | Privacy-preserving in-browser classification |
| Remote inference | OpenAI / Anthropic / Gemini / Ollama | LLM-powered analysis via user-provided API key |

## Getting Started

### Prerequisites

- **Node.js** 18+
- **Chrome** or **Edge** (Chromium-based)
- **Python** 3.10+ (only for model training)

### Install & Build the Extension

```bash
cd extension
npm install
npm run build
```

### Load in Chrome/Edge

1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/dist` folder

### Development Mode

```bash
cd extension
npm run dev
```

Vite will rebuild on file changes. Reload the extension in `chrome://extensions` after each build.

## Usage

### Analyze Selected Text

1. Highlight any text on a webpage
2. Click the floating **"Analyze with ClearRead"** button
3. Detected fallacies appear as colored underlines with hover tooltips
4. Click **"See Full Analysis"** to open the side panel

### Analyze a Full Page

1. Click the ClearRead extension icon in the toolbar
2. Click **"Analyze Full Page"**
3. Results appear in the side panel

### Switch Inference Engine

- Click the **▾** chevron on the floating button to choose between **Local Model** and **LLM**
- Configure LLM provider and API key in the popup settings

### LLM Providers

| Provider | Setup |
|----------|-------|
| **Ollama** | Install [Ollama](https://ollama.ai), pull a model (e.g., `ollama pull llama3.1`), runs locally for free |
| **OpenAI** | Provide your API key in settings |
| **Anthropic** | Provide your API key in settings |
| **Google Gemini** | Provide your API key in settings |

## Model Training

The local model is a fine-tuned **DistilRoBERTa** (`distilroberta-base`, 82M parameters) trained on logical fallacy datasets and LLM-distilled data.

### Setup

```bash
cd model
pip install -r requirements.txt
```

### Training Pipeline

```bash
# 1. Prepare data — download, clean, map labels, split
python scripts/prepare_data.py

# 2. Train the classifier
python scripts/train.py

# 3. Evaluate on test set
python scripts/evaluate.py

# 4. Export to ONNX + INT8 quantization
python scripts/export_onnx.py
```

### V2 Model (LLM Distillation)

An improved model trained on additional LLM-distilled data covering 41 categories:

```bash
# Generate distillation data via Ollama
python scripts/generate_distillation_data.py

# Train V2
python scripts/train_v2.py

# Export V2
python scripts/export_onnx_v2.py
```

### Benchmark

A cross-model evaluation benchmark compares local and remote engines against 35 gold-standard annotated passages:

```bash
python scripts/benchmark.py
```

**Benchmark results (selected):**

| Model | Precision | Recall | F1 | False Positive Rate |
|-------|-----------|--------|----|---------------------|
| Gemini 2.5 Flash | 71% | 97% | **82%** | 10% |
| Gemini 2.5 Pro | 60% | 94% | 73% | 0% |
| OpenAI gpt-5.4-mini | 45% | 89% | 60% | 10% |
| phi3 (Ollama) | 69% | 50% | 58% | 10% |
| Local DistilRoBERTa V2 | **78%** | 39% | 52% | 40% |

The local model has the highest precision (78%) and zero latency. Cloud LLMs offer significantly higher recall at the cost of latency and API costs.

## Project Structure

```
clear-read/
├── extension/                      # Browser extension
│   ├── manifest.json               # Manifest V3 configuration
│   ├── package.json
│   ├── vite.config.ts
│   ├── public/
│   │   ├── content.css             # Content script styles
│   │   ├── model/                  # ONNX fallacy classifier
│   │   ├── claim_model/            # ONNX claim detector
│   │   └── icons/
│   └── src/
│       ├── background/
│       │   ├── service-worker.ts   # Message routing & orchestration
│       │   └── inference/
│       │       ├── engine.ts       # Engine factory (local/remote)
│       │       ├── local-engine.ts # Transformers.js / ONNX inference
│       │       ├── remote-engine.ts# LLM inference (multi-provider)
│       │       └── prompts.ts      # Agent prompt & JSON schema
│       ├── content/
│       │   ├── content-script.ts   # Selection listener & floating button
│       │   └── highlighter.ts      # Inline annotation rendering
│       ├── popup/                  # Extension popup (React)
│       ├── sidepanel/              # Side panel UI (React)
│       │   ├── AnalysisView.tsx
│       │   ├── FallacyCard.tsx
│       │   ├── ExplainabilityView.tsx
│       │   ├── SummaryBar.tsx
│       │   └── EmptyState.tsx
│       └── shared/                 # Shared types, constants, messaging
│
├── model/                          # ML training pipeline
│   ├── requirements.txt
│   ├── configs/                    # Training configs (YAML)
│   ├── data/                       # Datasets (processed, benchmark)
│   ├── scripts/                    # Training, evaluation, export scripts
│   └── output/                     # Trained models, metrics, charts
│
└── docs/
    └── fallacy_definitions.md      # Full taxonomy reference
```

## Tech Stack

**Extension:**
- TypeScript, React 18, Vite
- [CRXJS Vite Plugin](https://crxjs.dev/vite-plugin/) for Manifest V3 bundling
- [@huggingface/transformers](https://huggingface.co/docs/transformers.js) for in-browser ONNX inference
- Chrome Extensions API (Manifest V3, Side Panel, Storage)

**Model Training:**
- PyTorch, HuggingFace Transformers
- ONNX + INT8 dynamic quantization via Optimum
- scikit-learn for evaluation metrics

## License

MIT
