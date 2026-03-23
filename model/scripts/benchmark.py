"""
benchmark.py — ClearRead cross-model evaluation benchmark

Runs each benchmark passage through multiple LLM models (Ollama, Gemini)
and compares results against gold-standard annotations.

Metrics:
  - Detection Rate (recall): what fraction of expected detections were found
  - Precision: what fraction of model detections match expected ones
  - False Positive Rate: how often clean text gets flagged
  - Technique Accuracy: when a detection is made, is the technique correct
  - Overall F1: harmonic mean of precision and recall

Usage:
    python benchmark.py                          # Ollama models only
    python benchmark.py --gemini-key YOUR_KEY    # Include Gemini
    python benchmark.py --models llama3.1:8b     # Specific model only
"""

import json
import re
import sys
import time
import argparse
from pathlib import Path
from dataclasses import dataclass, field

import requests
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np


# ─── Configuration ──────────────────────────────────────────────────

OLLAMA_URL = "http://localhost:11434"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models"
OPENAI_URL = "https://api.openai.com/v1/chat/completions"
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"

# System prompt — mirrors the TypeScript version in prompts.ts
# We use a compact version to keep this script self-contained
SYSTEM_PROMPT = """You are ClearRead, an expert rhetorical analyst. Analyze the provided text for logical fallacies, propaganda techniques, and manipulative rhetoric. Use soft, educational language.

For each detection:
1. Identify the specific technique
2. Quote the EXACT text snippet (verbatim from the original)
3. Explain why this is an example of the technique
4. Rate confidence: high, medium, or low
5. Identify 3-5 key trigger phrases

Techniques to detect: Straw Man, Begging the Question, Ad Hominem, Post Hoc (False Cause), Loaded Question, False Dichotomy, Equivocation, Appeal to Authority, Hasty Generalization, Appeal to Popular Opinion, Slippery Slope, Red Herring, Appeal to Emotion, Whataboutism, Loaded Language, False Equivalence, Circular Reasoning, False Analogy, Appeal to Ignorance, Appeal to Nature, Appeal to Tradition, No True Scotsman, Guilt by Association, Cherry Picking, Genetic Fallacy, Composition/Division, Anecdotal Evidence, Appeal to Consequence, Shifting Burden of Proof, Glittering Generalities, Plain Folks, Transfer, Testimonial, Name Calling, Scapegoating, Fear Mongering, Dog Whistle, Innuendo, Projection, Sloganeering, Euphemism/Dysphemism

Confidence rubric:
- high: Clear textbook example
- medium: Plausible but could be read differently
- low: Subtle or borderline

Do NOT flag: normal persuasive writing, stated opinions with reasoning, citing relevant experts, rhetorical questions in opinion pieces, strong but evidence-backed language, analogies with acknowledged limits.

Respond with ONLY valid JSON:
{"detections":[{"technique":"Name","snippet":"exact quote","explanation":"explanation","confidence":"high|medium|low","trigger_phrases":["p1","p2"]}],"overall_assessment":"summary"}

If no techniques are detected, return: {"detections":[],"overall_assessment":"No significant rhetorical concerns detected."}"""


# ─── Data Structures ────────────────────────────────────────────────

@dataclass
class Detection:
    technique: str
    snippet: str
    confidence: str


@dataclass
class PassageResult:
    passage_id: str
    category: str
    text: str
    expected: list[Detection]
    predicted: list[Detection]
    true_positives: int = 0
    false_positives: int = 0
    false_negatives: int = 0
    technique_matches: int = 0
    latency_ms: float = 0


@dataclass
class ModelResult:
    model_name: str
    results: list[PassageResult] = field(default_factory=list)
    total_latency_ms: float = 0

    @property
    def precision(self) -> float:
        tp = sum(r.true_positives for r in self.results)
        fp = sum(r.false_positives for r in self.results)
        return tp / (tp + fp) if (tp + fp) > 0 else 0

    @property
    def recall(self) -> float:
        tp = sum(r.true_positives for r in self.results)
        fn = sum(r.false_negatives for r in self.results)
        return tp / (tp + fn) if (tp + fn) > 0 else 0

    @property
    def f1(self) -> float:
        p, r = self.precision, self.recall
        return 2 * p * r / (p + r) if (p + r) > 0 else 0

    @property
    def false_positive_rate(self) -> float:
        clean = [r for r in self.results if r.category == "clean_text"]
        if not clean:
            return 0
        flagged = sum(1 for r in clean if r.predicted)
        return flagged / len(clean)

    @property
    def technique_accuracy(self) -> float:
        tp = sum(r.true_positives for r in self.results)
        matches = sum(r.technique_matches for r in self.results)
        return matches / tp if tp > 0 else 0

    @property
    def avg_latency(self) -> float:
        if not self.results:
            return 0
        return self.total_latency_ms / len(self.results)


# ─── Technique Name Normalization ───────────────────────────────────

TECHNIQUE_MAP = {
    "straw man": "straw_man",
    "begging the question": "begging_the_question",
    "ad hominem": "ad_hominem",
    "post hoc": "post_hoc",
    "false cause": "post_hoc",
    "post hoc / false cause": "post_hoc",
    "post hoc (false cause)": "post_hoc",
    "loaded question": "loaded_question",
    "false dichotomy": "false_dichotomy",
    "false dilemma": "false_dichotomy",
    "black-and-white fallacy": "false_dichotomy",
    "equivocation": "equivocation",
    "appeal to authority": "appeal_to_authority",
    "hasty generalization": "hasty_generalization",
    "appeal to popular opinion": "appeal_to_popular_opinion",
    "bandwagon": "appeal_to_popular_opinion",
    "argumentum ad populum": "appeal_to_popular_opinion",
    "slippery slope": "slippery_slope",
    "red herring": "red_herring",
    "appeal to emotion": "appeal_to_emotion",
    "whataboutism": "whataboutism",
    "tu quoque": "whataboutism",
    "loaded language": "loaded_language",
    "false equivalence": "false_equivalence",
    "false balance": "false_equivalence",
    "circular reasoning": "circular_reasoning",
    "false analogy": "false_analogy",
    "appeal to ignorance": "appeal_to_ignorance",
    "argument from ignorance": "appeal_to_ignorance",
    "appeal to nature": "appeal_to_nature",
    "naturalistic fallacy": "appeal_to_nature",
    "appeal to tradition": "appeal_to_tradition",
    "no true scotsman": "no_true_scotsman",
    "guilt by association": "guilt_by_association",
    "cherry picking": "cherry_picking",
    "cherry-picking": "cherry_picking",
    "genetic fallacy": "genetic_fallacy",
    "composition / division": "composition_division",
    "anecdotal evidence": "anecdotal_evidence",
    "anecdotal fallacy": "anecdotal_evidence",
    "appeal to consequence": "appeal_to_consequence",
    "shifting burden of proof": "shifting_burden_of_proof",
    "glittering generalities": "glittering_generalities",
    "plain folks": "plain_folks",
    "transfer": "transfer",
    "testimonial": "testimonial",
    "name calling": "name_calling",
    "name-calling": "name_calling",
    "labeling": "name_calling",
    "scapegoating": "scapegoating",
    "fear mongering": "fear_mongering",
    "fearmongering": "fear_mongering",
    "fear-mongering": "fear_mongering",
    "appeal to fear": "fear_mongering",
    "scare tactics": "fear_mongering",
    "dog whistle": "dog_whistle",
    "innuendo": "innuendo",
    "insinuation": "innuendo",
    "projection": "projection",
    "sloganeering": "sloganeering",
    "euphemism": "euphemism_dysphemism",
    "dysphemism": "euphemism_dysphemism",
    "euphemism / dysphemism": "euphemism_dysphemism",
    "euphemism/dysphemism": "euphemism_dysphemism",
}


def normalize_technique(name: str) -> str:
    """Normalize an LLM technique name to our canonical form."""
    lower = name.lower().strip()
    if lower in TECHNIQUE_MAP:
        return TECHNIQUE_MAP[lower]
    # Try converting to snake_case
    as_key = re.sub(r"[\s/\-]+", "_", lower)
    return as_key


# ─── LLM Calling ────────────────────────────────────────────────────

def call_ollama(text: str, model: str, context_size: int = 8192) -> tuple[list[Detection], float]:
    """Call Ollama and return (detections, latency_ms)."""
    user_prompt = f'Analyze the following text for rhetorical techniques and logical fallacies. Return your analysis as JSON.\n\nText to analyze:\n"""\n{text}\n"""'

    start = time.time()
    resp = requests.post(
        f"{OLLAMA_URL}/api/chat",
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            "stream": False,
            "format": "json",
            "options": {"num_ctx": context_size},
        },
        timeout=120,
    )
    latency = (time.time() - start) * 1000

    if not resp.ok:
        print(f"  [WARN] Ollama {model} returned {resp.status_code}: {resp.text[:200]}")
        return [], latency

    data = resp.json()
    content = data.get("message", {}).get("content", "")
    return parse_llm_response(content), latency


def call_gemini(text: str, model: str, api_key: str) -> tuple[list[Detection], float]:
    """Call Google Gemini and return (detections, latency_ms)."""
    user_prompt = f'Analyze the following text for rhetorical techniques and logical fallacies. Return your analysis as JSON.\n\nText to analyze:\n"""\n{text}\n"""'

    url = f"{GEMINI_URL}/{model}:generateContent?key={api_key}"
    start = time.time()
    resp = requests.post(
        url,
        json={
            "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
            "contents": [{"parts": [{"text": user_prompt}]}],
            "generationConfig": {
                "temperature": 0.3,
                "responseMimeType": "application/json",
            },
        },
        timeout=60,
    )
    latency = (time.time() - start) * 1000

    if not resp.ok:
        print(f"  [WARN] Gemini {model} returned {resp.status_code}: {resp.text[:200]}")
        return [], latency

    data = resp.json()
    content = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
    return parse_llm_response(content), latency


def call_openai(text: str, model: str, api_key: str) -> tuple[list[Detection], float]:
    """Call OpenAI and return (detections, latency_ms)."""
    user_prompt = f'Analyze the following text for rhetorical techniques and logical fallacies. Return your analysis as JSON.\n\nText to analyze:\n"""\n{text}\n"""'

    start = time.time()
    resp = requests.post(
        OPENAI_URL,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.3,
            "response_format": {"type": "json_object"},
        },
        timeout=120,
    )
    latency = (time.time() - start) * 1000

    if not resp.ok:
        print(f"  [WARN] OpenAI {model} returned {resp.status_code}: {resp.text[:200]}")
        return [], latency

    data = resp.json()
    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    return parse_llm_response(content), latency


def call_anthropic(text: str, model: str, api_key: str) -> tuple[list[Detection], float]:
    """Call Anthropic Claude and return (detections, latency_ms)."""
    user_prompt = f'Analyze the following text for rhetorical techniques and logical fallacies. Return your analysis as JSON.\n\nText to analyze:\n"""\n{text}\n"""'

    start = time.time()
    resp = requests.post(
        ANTHROPIC_URL,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        json={
            "model": model,
            "max_tokens": 4096,
            "system": SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": user_prompt}],
        },
        timeout=120,
    )
    latency = (time.time() - start) * 1000

    if not resp.ok:
        print(f"  [WARN] Anthropic {model} returned {resp.status_code}: {resp.text[:200]}")
        return [], latency

    data = resp.json()
    content = ""
    for block in data.get("content", []):
        if block.get("type") == "text":
            content = block.get("text", "")
            break
    return parse_llm_response(content), latency


def call_local_model(text: str, model_dir: str, label_map: dict, classifier_pipeline, claim_pipeline=None) -> tuple[list[Detection], float]:
    """Run the local claim detector + fallacy classifier pipeline and return (detections, latency_ms)."""
    id_to_label = {v: k for k, v in label_map.items()}

    start = time.time()

    # Stage 1: Claim detection (if available) — filter out neutral text
    if claim_pipeline is not None:
        claim_result = claim_pipeline(text, truncation=True, max_length=256)
        if claim_result and claim_result[0]["label"] == "neutral" and claim_result[0]["score"] > 0.5:
            latency = (time.time() - start) * 1000
            return [], latency  # Pre-filtered as neutral

    # Stage 2: Fallacy classification
    results = classifier_pipeline(text, truncation=True, max_length=256, top_k=None)
    latency = (time.time() - start) * 1000

    detections = []
    if results:
        for r in results:
            score = r["score"]
            if score < 0.4:
                continue
            technique = r["label"]
            if technique == "clean" or technique == "neutral":
                continue
            confidence = "high" if score >= 0.8 else "medium" if score >= 0.6 else "low"
            detections.append(Detection(
                technique=normalize_technique(technique),
                snippet=text,
                confidence=confidence,
            ))
            break  # take top prediction only

    return detections, latency


def parse_llm_response(content: str) -> list[Detection]:
    """Parse JSON from LLM response, handling markdown fences."""
    cleaned = content.strip()
    cleaned = re.sub(r"^```(?:json)?\s*\n?", "", cleaned)
    cleaned = re.sub(r"\n?\s*```\s*$", "", cleaned)
    cleaned = cleaned.strip()

    # Find JSON boundaries
    first = cleaned.find("{")
    last = cleaned.rfind("}")
    if first != -1 and last > first:
        cleaned = cleaned[first:last + 1]

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        return []

    detections = []
    for d in parsed.get("detections", []):
        if not isinstance(d, dict) or "technique" not in d:
            continue
        detections.append(Detection(
            technique=normalize_technique(d.get("technique", "")),
            snippet=d.get("snippet", ""),
            confidence=d.get("confidence", "medium").lower(),
        ))
    return detections


# ─── Evaluation Logic ───────────────────────────────────────────────

def evaluate_passage(passage: dict, predicted: list[Detection]) -> PassageResult:
    """Compare predicted detections against gold-standard expected detections."""
    expected = [
        Detection(
            technique=det["technique"],
            snippet=det["snippet"],
            confidence=det["confidence"],
        )
        for det in passage["expected_detections"]
    ]

    result = PassageResult(
        passage_id=passage["id"],
        category=passage["category"],
        text=passage["text"],
        expected=expected,
        predicted=predicted,
    )

    # Match predictions to expected detections
    matched_expected = set()
    matched_predicted = set()

    for i, pred in enumerate(predicted):
        best_match = -1
        best_overlap = 0

        for j, exp in enumerate(expected):
            if j in matched_expected:
                continue
            # Check if snippets overlap (fuzzy match)
            overlap = snippet_overlap(pred.snippet, exp.snippet, passage["text"])
            if overlap > best_overlap:
                best_overlap = overlap
                best_match = j

        if best_match >= 0 and best_overlap > 0.3:
            matched_expected.add(best_match)
            matched_predicted.add(i)
            result.true_positives += 1
            # Check if technique matches
            if pred.technique == expected[best_match].technique:
                result.technique_matches += 1

    result.false_positives = len(predicted) - len(matched_predicted)
    result.false_negatives = len(expected) - len(matched_expected)

    return result


def snippet_overlap(pred_snippet: str, exp_snippet: str, full_text: str) -> float:
    """Calculate overlap between predicted and expected snippets using word-level Jaccard."""
    if not pred_snippet or not exp_snippet:
        return 0

    pred_words = set(pred_snippet.lower().split())
    exp_words = set(exp_snippet.lower().split())

    if not pred_words or not exp_words:
        return 0

    intersection = pred_words & exp_words
    union = pred_words | exp_words
    return len(intersection) / len(union) if union else 0


# ─── Chart Generation ───────────────────────────────────────────────

def generate_charts(model_results: list[ModelResult], output_dir: Path):
    """Generate comparison charts from benchmark results."""
    output_dir.mkdir(parents=True, exist_ok=True)

    names = [m.model_name for m in model_results]
    precisions = [m.precision for m in model_results]
    recalls = [m.recall for m in model_results]
    f1s = [m.f1 for m in model_results]
    fp_rates = [m.false_positive_rate for m in model_results]
    tech_accs = [m.technique_accuracy for m in model_results]
    latencies = [m.avg_latency / 1000 for m in model_results]  # seconds

    # Use a readable style — scale figure width with number of models
    fig_width = max(12, len(model_results) * 1.8)
    plt.rcParams.update({"font.size": 10, "figure.figsize": (fig_width, 6)})
    colors = ["#4F8FF7", "#FF6B6B", "#54D48C", "#FFB84D", "#B07AFF",
             "#FF85C0", "#36CFC9", "#FA8C16", "#597EF7", "#73D13D",
             "#F5222D", "#1890FF", "#722ED1", "#13C2C2", "#EB2F96"]

    # 1. Precision / Recall / F1 comparison
    fig, ax = plt.subplots(figsize=(10, 6))
    x = np.arange(len(names))
    width = 0.25
    ax.bar(x - width, precisions, width, label="Precision", color="#4F8FF7")
    ax.bar(x, recalls, width, label="Recall", color="#54D48C")
    ax.bar(x + width, f1s, width, label="F1", color="#FFB84D")
    ax.set_ylabel("Score")
    ax.set_title("Cross-Model Comparison: Precision, Recall, F1")
    ax.set_xticks(x)
    ax.set_xticklabels(names, rotation=45, ha="right")
    ax.set_ylim(0, 1.05)
    ax.legend()
    ax.grid(axis="y", alpha=0.3)
    for bars in ax.containers:
        ax.bar_label(bars, fmt="%.2f", fontsize=9, padding=2)
    fig.tight_layout()
    fig.savefig(output_dir / "precision_recall_f1.png", dpi=150)
    plt.close(fig)

    # 2. False positive rate comparison
    fig, ax = plt.subplots(figsize=(fig_width, 6))
    bars = ax.bar(names, fp_rates, color=colors[:len(names)])
    ax.set_ylabel("False Positive Rate")
    ax.set_title("False Positive Rate on Clean Text (Lower is Better)")
    ax.set_ylim(0, 1.05)
    ax.grid(axis="y", alpha=0.3)
    ax.bar_label(bars, fmt="%.0f%%", fontsize=11)
    # Convert to percentage for labels
    for bar, rate in zip(bars, fp_rates):
        bar.set_height(rate)
    plt.xticks(rotation=45, ha="right")
    fig.tight_layout()
    fig.savefig(output_dir / "false_positive_rate.png", dpi=150)
    plt.close(fig)

    # 3. Technique accuracy
    fig, ax = plt.subplots(figsize=(fig_width, 6))
    bars = ax.bar(names, tech_accs, color=colors[:len(names)])
    ax.set_ylabel("Technique Accuracy")
    ax.set_title("Technique Identification Accuracy (When Detection is Made)")
    ax.set_ylim(0, 1.05)
    ax.grid(axis="y", alpha=0.3)
    ax.bar_label(bars, fmt="%.2f", fontsize=11)
    plt.xticks(rotation=45, ha="right")
    fig.tight_layout()
    fig.savefig(output_dir / "technique_accuracy.png", dpi=150)
    plt.close(fig)

    # 4. Latency comparison
    fig, ax = plt.subplots(figsize=(fig_width, 6))
    bars = ax.bar(names, latencies, color=colors[:len(names)])
    ax.set_ylabel("Average Latency (seconds)")
    ax.set_title("Average Analysis Latency per Passage")
    ax.grid(axis="y", alpha=0.3)
    ax.bar_label(bars, fmt="%.1fs", fontsize=11)
    plt.xticks(rotation=45, ha="right")
    fig.tight_layout()
    fig.savefig(output_dir / "latency.png", dpi=150)
    plt.close(fig)

    # 5. Per-category breakdown (recall by category)
    categories = ["clear_fallacy", "multi_technique", "subtle"]
    category_labels = ["Clear Fallacy", "Multi-Technique", "Subtle"]

    fig, ax = plt.subplots(figsize=(10, 6))
    x = np.arange(len(categories))
    width = 0.8 / len(model_results)

    for i, model in enumerate(model_results):
        cat_recalls = []
        for cat in categories:
            cat_results = [r for r in model.results if r.category == cat]
            tp = sum(r.true_positives for r in cat_results)
            fn = sum(r.false_negatives for r in cat_results)
            r = tp / (tp + fn) if (tp + fn) > 0 else 0
            cat_recalls.append(r)
        offset = (i - len(model_results) / 2 + 0.5) * width
        bars = ax.bar(x + offset, cat_recalls, width, label=model.model_name, color=colors[i % len(colors)])
        ax.bar_label(bars, fmt="%.2f", fontsize=8, padding=2)

    ax.set_ylabel("Recall")
    ax.set_title("Detection Recall by Passage Category")
    ax.set_xticks(x)
    ax.set_xticklabels(category_labels)
    ax.set_ylim(0, 1.15)
    ax.legend()
    ax.grid(axis="y", alpha=0.3)
    fig.tight_layout()
    fig.savefig(output_dir / "recall_by_category.png", dpi=150)
    plt.close(fig)

    # 6. Radar / summary chart
    fig, ax = plt.subplots(figsize=(8, 8), subplot_kw=dict(polar=True))
    metrics = ["Precision", "Recall", "F1", "1 - FP Rate", "Tech. Acc."]
    num_metrics = len(metrics)
    angles = np.linspace(0, 2 * np.pi, num_metrics, endpoint=False).tolist()
    angles += angles[:1]

    for i, model in enumerate(model_results):
        values = [model.precision, model.recall, model.f1, 1 - model.false_positive_rate, model.technique_accuracy]
        values += values[:1]
        ax.plot(angles, values, "o-", linewidth=2, label=model.model_name, color=colors[i % len(colors)])
        ax.fill(angles, values, alpha=0.1, color=colors[i % len(colors)])

    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(metrics)
    ax.set_ylim(0, 1.1)
    ax.set_title("Model Comparison Summary", y=1.08, fontsize=14)
    ax.legend(loc="upper right", bbox_to_anchor=(1.3, 1.1))
    fig.tight_layout()
    fig.savefig(output_dir / "radar_summary.png", dpi=150)
    plt.close(fig)

    print(f"\n📊 Charts saved to {output_dir}/")


# ─── Main ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="ClearRead cross-model benchmark")
    parser.add_argument("--models", nargs="+", default=["llama3.1:8b", "phi3"],
                        help="Ollama model names to benchmark")
    parser.add_argument("--gemini-key", type=str, default=None,
                        help="Google Gemini API key (optional)")
    parser.add_argument("--gemini-models", nargs="+",
                        default=["gemini-2.5-flash", "gemini-2.5-pro", "gemini-3.1-flash-lite-preview", "gemini-3-flash-preview", "gemini-3.1-pro-preview"],
                        help="Gemini model names to benchmark")
    parser.add_argument("--openai-key", type=str, default=None,
                        help="OpenAI API key (optional)")
    parser.add_argument("--openai-models", nargs="+",
                        default=["gpt-5.4-nano-2026-03-17", "gpt-5.4-mini-2026-03-17", "gpt-5.4-2026-03-05"],
                        help="OpenAI model names to benchmark")
    parser.add_argument("--anthropic-key", type=str, default=None,
                        help="Anthropic API key (optional)")
    parser.add_argument("--anthropic-models", nargs="+",
                        default=["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-6"],
                        help="Anthropic model names to benchmark")
    parser.add_argument("--local-model", action="store_true", default=False,
                        help="Include local V2 DistilRoBERTa model")
    parser.add_argument("--context-size", type=int, default=8192,
                        help="Ollama context size")
    parser.add_argument("--output-dir", type=str, default=None,
                        help="Output directory for results")
    args = parser.parse_args()

    # Load Gemini key from .env if not provided via CLI
    gemini_key = args.gemini_key
    openai_key = args.openai_key
    anthropic_key = args.anthropic_key
    if not gemini_key or not openai_key or not anthropic_key:
        env_path = Path(__file__).parent.parent.parent / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if line.startswith("GEMINI_API_KEY=") and not gemini_key:
                    gemini_key = line.split("=", 1)[1].strip()
                elif line.startswith("OPENAI_API_KEY=") and not openai_key:
                    openai_key = line.split("=", 1)[1].strip()
                elif line.startswith("CLAUDE_API_KEY=") and not anthropic_key:
                    anthropic_key = line.split("=", 1)[1].strip()

    # Load benchmark
    benchmark_path = Path(__file__).parent.parent / "data" / "benchmark" / "benchmark.json"
    if not benchmark_path.exists():
        print(f"❌ Benchmark file not found: {benchmark_path}")
        sys.exit(1)

    with open(benchmark_path, encoding="utf-8") as f:
        benchmark = json.load(f)

    passages = benchmark["passages"]
    print(f"📋 Loaded {len(passages)} benchmark passages")
    print(f"   Categories: {', '.join(set(p['category'] for p in passages))}")

    # Determine output directory
    output_dir = Path(args.output_dir) if args.output_dir else Path(__file__).parent.parent / "output" / "benchmark"
    output_dir.mkdir(parents=True, exist_ok=True)

    # Build model list
    model_configs = []
    for model in args.models:
        model_configs.append(("ollama", model))
    if gemini_key:
        for gm in args.gemini_models:
            model_configs.append(("gemini", gm))
    if openai_key:
        for om in args.openai_models:
            model_configs.append(("openai", om))
    if anthropic_key:
        for am in args.anthropic_models:
            model_configs.append(("anthropic", am))

    # Load local model if requested
    local_classifier = None
    local_label_map = None
    local_claim_detector = None
    if args.local_model:
        try:
            from transformers import AutoModelForSequenceClassification, AutoTokenizer, pipeline as hf_pipeline
            local_model_dir = Path(__file__).parent.parent / "output_v2" / "best_model"
            local_label_path = Path(__file__).parent.parent / "data" / "processed" / "v2" / "label_map_v2.json"
            claim_model_dir = Path(__file__).parent.parent / "output_claim_detector" / "best_model"
            if local_model_dir.exists() and local_label_path.exists():
                print(f"Loading local V2 fallacy classifier from {local_model_dir}...")
                tokenizer = AutoTokenizer.from_pretrained(str(local_model_dir))
                model = AutoModelForSequenceClassification.from_pretrained(str(local_model_dir))
                local_classifier = hf_pipeline("text-classification", model=model, tokenizer=tokenizer, top_k=None, device="cuda")
                with open(local_label_path, encoding="utf-8") as f:
                    local_label_map = json.load(f)

                # Load claim detector if available
                if claim_model_dir.exists():
                    print(f"Loading claim detector from {claim_model_dir}...")
                    claim_tok = AutoTokenizer.from_pretrained(str(claim_model_dir))
                    claim_mod = AutoModelForSequenceClassification.from_pretrained(str(claim_model_dir))
                    local_claim_detector = hf_pipeline("text-classification", model=claim_mod, tokenizer=claim_tok, device="cuda")
                    model_configs.append(("local", "V2 Pipeline (Claim+Fallacy)"))
                else:
                    print("⚠️  Claim detector not found, running fallacy classifier only")
                    model_configs.append(("local", "V2 DistilRoBERTa"))
            else:
                print("⚠️  Local V2 model not found, skipping")
        except Exception as e:
            print(f"⚠️  Failed to load local model: {e}")

    print(f"🤖 Models to benchmark: {', '.join(f'{p}:{m}' for p, m in model_configs)}")
    print()

    # Run benchmark
    all_model_results = []

    for provider, model_name in model_configs:
        display_name = model_name if provider == "ollama" else f"Gemini {model_name}" if provider == "gemini" else f"OpenAI {model_name}" if provider == "openai" else f"Claude {model_name}" if provider == "anthropic" else f"Local {model_name}"
        print(f"═══ Benchmarking: {display_name} ═══")

        model_result = ModelResult(model_name=display_name)

        for i, passage in enumerate(passages):
            print(f"  [{i+1}/{len(passages)}] {passage['id']} ({passage['category']})...", end=" ", flush=True)

            try:
                if provider == "ollama":
                    predicted, latency = call_ollama(passage["text"], model_name, args.context_size)
                elif provider == "gemini":
                    predicted, latency = call_gemini(passage["text"], model_name, gemini_key)
                elif provider == "openai":
                    predicted, latency = call_openai(passage["text"], model_name, openai_key)
                elif provider == "anthropic":
                    predicted, latency = call_anthropic(passage["text"], model_name, anthropic_key)
                elif provider == "local":
                    predicted, latency = call_local_model(passage["text"], "", local_label_map, local_classifier, local_claim_detector)
                else:
                    predicted, latency = [], 0

                result = evaluate_passage(passage, predicted)
                result.latency_ms = latency
                model_result.results.append(result)
                model_result.total_latency_ms += latency

                # Print result
                status = "✓" if result.false_positives == 0 and result.false_negatives == 0 else "△"
                if passage["category"] == "clean_text" and predicted:
                    status = "✗ FP"
                elif result.true_positives == 0 and result.expected:
                    status = "✗ FN"

                exp_count = len(result.expected)
                pred_count = len(result.predicted)
                print(f"{status}  expected={exp_count} predicted={pred_count} tp={result.true_positives} fp={result.false_positives} fn={result.false_negatives} ({latency:.0f}ms)")

            except Exception as e:
                print(f"ERROR: {e}")
                model_result.results.append(PassageResult(
                    passage_id=passage["id"],
                    category=passage["category"],
                    text=passage["text"],
                    expected=[Detection(d["technique"], d["snippet"], d["confidence"]) for d in passage["expected_detections"]],
                    predicted=[],
                    false_negatives=len(passage["expected_detections"]),
                ))

        # Print model summary
        print(f"\n  📊 {display_name} Summary:")
        print(f"     Precision:          {model_result.precision:.2%}")
        print(f"     Recall:             {model_result.recall:.2%}")
        print(f"     F1:                 {model_result.f1:.2%}")
        print(f"     False Positive Rate: {model_result.false_positive_rate:.0%}")
        print(f"     Technique Accuracy: {model_result.technique_accuracy:.2%}")
        print(f"     Avg Latency:        {model_result.avg_latency / 1000:.1f}s")
        print()

        all_model_results.append(model_result)

    # Save detailed results as JSON
    results_json = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "benchmark_file": str(benchmark_path),
        "num_passages": len(passages),
        "models": [],
    }

    for model in all_model_results:
        model_data = {
            "name": model.model_name,
            "precision": round(model.precision, 4),
            "recall": round(model.recall, 4),
            "f1": round(model.f1, 4),
            "false_positive_rate": round(model.false_positive_rate, 4),
            "technique_accuracy": round(model.technique_accuracy, 4),
            "avg_latency_ms": round(model.avg_latency, 1),
            "passages": [],
        }
        for r in model.results:
            model_data["passages"].append({
                "id": r.passage_id,
                "category": r.category,
                "expected_count": len(r.expected),
                "predicted_count": len(r.predicted),
                "true_positives": r.true_positives,
                "false_positives": r.false_positives,
                "false_negatives": r.false_negatives,
                "technique_matches": r.technique_matches,
                "latency_ms": round(r.latency_ms, 1),
                "predicted_techniques": [d.technique for d in r.predicted],
            })
        results_json["models"].append(model_data)

    with open(output_dir / "benchmark_results.json", "w", encoding="utf-8") as f:
        json.dump(results_json, f, indent=2)
    print(f"💾 Results saved to {output_dir / 'benchmark_results.json'}")

    # Generate charts
    if len(all_model_results) >= 1:
        generate_charts(all_model_results, output_dir)

    # Print final comparison table
    print("\n" + "═" * 80)
    print("CROSS-MODEL COMPARISON")
    print("═" * 80)
    header = f"{'Model':<25} {'Precision':>10} {'Recall':>10} {'F1':>10} {'FP Rate':>10} {'Tech Acc':>10} {'Latency':>10}"
    print(header)
    print("─" * 80)
    for model in all_model_results:
        row = f"{model.model_name:<25} {model.precision:>10.2%} {model.recall:>10.2%} {model.f1:>10.2%} {model.false_positive_rate:>10.0%} {model.technique_accuracy:>10.2%} {model.avg_latency / 1000:>9.1f}s"
        print(row)
    print("═" * 80)


if __name__ == "__main__":
    main()
