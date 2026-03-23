"""
generate_distillation_data.py — Generate training data using LLM distillation

Uses a local Ollama instance (or other LLM) to generate high-quality labeled
examples for the expanded 41-category fallacy/propaganda taxonomy.

This creates synthetic training data by:
1. Generating example sentences for each category using the LLM
2. Generating "clean" (no-fallacy) sentences as negative examples
3. Saving the results as training data for the v2 classifier

Usage:
    python generate_distillation_data.py [--ollama-url http://localhost:11434] [--model llama3.1:8b] [--examples-per-category 50]

Outputs:
    data/processed/v2/distilled_train.json
    data/processed/v2/distilled_val.json
    data/processed/v2/distilled_test.json
    data/processed/v2/label_map_v2.json
"""

import argparse
import json
import os
import random
import time
from collections import Counter
from pathlib import Path

import requests
from sklearn.model_selection import train_test_split

# The expanded 41-category taxonomy (must match types.ts)
LABEL_NAMES_V2 = [
    "straw_man",
    "begging_the_question",
    "ad_hominem",
    "post_hoc",
    "false_dichotomy",
    "equivocation",
    "appeal_to_authority",
    "hasty_generalization",
    "appeal_to_popular_opinion",
    "red_herring",
    "appeal_to_emotion",
    "whataboutism",
    "loaded_language",
    "slippery_slope",
    "loaded_question",
    "false_equivalence",
    "circular_reasoning",
    "false_analogy",
    "appeal_to_ignorance",
    "appeal_to_nature",
    "appeal_to_tradition",
    "no_true_scotsman",
    "guilt_by_association",
    "cherry_picking",
    "genetic_fallacy",
    "composition_division",
    "anecdotal_evidence",
    "appeal_to_consequence",
    "shifting_burden_of_proof",
    "glittering_generalities",
    "plain_folks",
    "transfer",
    "testimonial",
    "name_calling",
    "scapegoating",
    "fear_mongering",
    "dog_whistle",
    "innuendo",
    "projection",
    "sloganeering",
    "euphemism_dysphemism",
]

CATEGORY_DESCRIPTIONS = {
    "straw_man": "Misrepresenting someone's argument to make it easier to attack",
    "begging_the_question": "Assuming the conclusion within the premise",
    "ad_hominem": "Attacking the person rather than their argument",
    "post_hoc": "Assuming causation from correlation or sequence",
    "false_dichotomy": "Presenting only two options when more exist",
    "equivocation": "Using a word with multiple meanings ambiguously",
    "appeal_to_authority": "Using an authority figure's opinion as proof",
    "hasty_generalization": "Drawing broad conclusions from limited examples",
    "appeal_to_popular_opinion": "Arguing something is true because many believe it",
    "red_herring": "Introducing an irrelevant topic to divert attention",
    "appeal_to_emotion": "Using emotional manipulation instead of logical argument",
    "whataboutism": "Deflecting criticism by pointing to someone else's behavior",
    "loaded_language": "Using emotionally charged words to influence perception",
    "slippery_slope": "Arguing one event will inevitably lead to extreme consequences",
    "loaded_question": "A question that presupposes something unproven",
    "false_equivalence": "Treating two very different things as if they are the same",
    "circular_reasoning": "Using the conclusion as a premise in the argument",
    "false_analogy": "Comparing two things that differ in crucial ways",
    "appeal_to_ignorance": "Arguing something is true because it hasn't been proven false",
    "appeal_to_nature": "Arguing something is good because it is natural",
    "appeal_to_tradition": "Arguing something is right because it has always been done",
    "no_true_scotsman": "Redefining criteria to dismiss counterexamples",
    "guilt_by_association": "Discrediting by linking to a negative association",
    "cherry_picking": "Selectively presenting only supporting evidence",
    "genetic_fallacy": "Judging something based on its origin rather than merit",
    "composition_division": "Assuming parts and wholes share the same properties",
    "anecdotal_evidence": "Using personal stories as definitive proof",
    "appeal_to_consequence": "Arguing a belief is true/false based on consequences",
    "shifting_burden_of_proof": "Demanding others disprove a claim rather than proving it",
    "glittering_generalities": "Using vague, emotionally positive words without substance",
    "plain_folks": "Portraying oneself as ordinary to build trust",
    "transfer": "Borrowing prestige by associating with respected symbols",
    "testimonial": "Using celebrity endorsements as proof",
    "name_calling": "Using derogatory labels to create prejudice",
    "scapegoating": "Blaming a group for complex problems they didn't cause",
    "fear_mongering": "Exaggerating threats to create panic",
    "dog_whistle": "Using coded language with hidden meaning for a subgroup",
    "innuendo": "Implying something negative without stating it directly",
    "projection": "Accusing others of one's own behavior",
    "sloganeering": "Using catchy phrases instead of substantive argument",
    "euphemism_dysphemism": "Replacing accurate language to soften or inflame perception",
}

GENERATION_PROMPT = """Generate {count} diverse, realistic example sentences that demonstrate the logical fallacy or propaganda technique called "{name}".

Definition: {description}

Requirements:
- Each example should be 1-3 sentences long
- Make them sound like real-world text from news articles, social media posts, political speeches, opinion columns, or everyday arguments
- Vary the topics: politics, health, technology, environment, economics, social issues, sports, education
- Vary the writing style: formal, informal, passionate, subtle
- Some should be obvious examples, others more subtle
- Do NOT include any labels, explanations, or meta-commentary — just the raw example text
- Do NOT number them or use bullet points

Return ONLY a JSON array of strings. Example format:
["Example sentence one.", "Another example that demonstrates the technique.", "A third diverse example."]

Return valid JSON only. No markdown, no explanation."""

CLEAN_PROMPT = """Generate {count} diverse, realistic sentences that are CLEAN — they contain NO logical fallacies, propaganda techniques, or manipulative rhetoric.

These should be:
- Factual reporting, balanced opinions, or neutral statements
- From varied topics: news, science, sports, weather, business, daily life
- Some short (1 sentence), some longer (2-3 sentences)
- Written in varied styles: news headlines, casual social media, academic, conversational

Return ONLY a JSON array of strings. No markdown, no explanation."""


def call_ollama(prompt: str, model: str, url: str, max_retries: int = 3) -> str:
    """Call Ollama API and return the response text."""
    for attempt in range(max_retries):
        try:
            resp = requests.post(
                f"{url}/api/chat",
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "stream": False,
                },
                timeout=120,
            )
            if resp.status_code == 200:
                data = resp.json()
                return data.get("message", {}).get("content", "")
            else:
                print(f"  Ollama returned {resp.status_code}, retrying ({attempt + 1}/{max_retries})...")
                time.sleep(2)
        except requests.exceptions.RequestException as e:
            print(f"  Request failed: {e}, retrying ({attempt + 1}/{max_retries})...")
            time.sleep(2)
    return ""


def parse_json_array(text: str) -> list[str]:
    """Parse a JSON array from LLM response, handling common issues."""
    text = text.strip()
    # Strip markdown fences
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
    if text.endswith("```"):
        text = text.rsplit("```", 1)[0]
    text = text.strip()

    # Try to find JSON array
    start = text.find("[")
    end = text.rfind("]")
    if start != -1 and end > start:
        try:
            result = json.loads(text[start : end + 1])
            if isinstance(result, list):
                return [s for s in result if isinstance(s, str) and len(s.strip()) > 10]
        except json.JSONDecodeError:
            pass

    # Try JSON object — LLMs sometimes return {"example1": "", "example2": ""}
    obj_start = text.find("{")
    obj_end = text.rfind("}")
    if obj_start != -1 and obj_end > obj_start:
        try:
            result = json.loads(text[obj_start : obj_end + 1])
            if isinstance(result, dict):
                # Keys are the examples
                return [k for k in result.keys() if isinstance(k, str) and len(k.strip()) > 10]
        except json.JSONDecodeError:
            pass

    # Fallback: split by newlines and take non-empty lines that look like sentences
    lines = []
    for line in text.split("\n"):
        line = line.strip().strip('"').strip("'").strip(",").strip()
        # Remove numbering like "1." or "- "
        if line and len(line) > 10:
            import re
            line = re.sub(r'^\d+\.\s*', '', line)
            line = re.sub(r'^[-*]\s*', '', line)
            if len(line) > 10:
                lines.append(line)
    return lines


def generate_examples_for_category(
    category: str, description: str, count: int, model: str, url: str
) -> list[dict]:
    """Generate synthetic examples for a single category."""
    # Generate in batches to get more diversity
    batch_size = min(count, 15)
    all_examples = []

    while len(all_examples) < count:
        remaining = count - len(all_examples)
        batch = min(batch_size, remaining)

        prompt = GENERATION_PROMPT.format(
            count=batch, name=category.replace("_", " ").title(), description=description
        )
        response = call_ollama(prompt, model, url)
        sentences = parse_json_array(response)

        for text in sentences:
            all_examples.append({
                "text": text.strip(),
                "label": category,
                "source": "distillation",
            })

        if not sentences:
            print(f"    Warning: empty response for {category}, skipping batch")
            break

        # Small delay to avoid overwhelming the model
        time.sleep(0.5)

    return all_examples[:count]


def generate_clean_examples(count: int, model: str, url: str) -> list[dict]:
    """Generate clean (no-fallacy) examples."""
    batch_size = 20
    all_examples = []

    while len(all_examples) < count:
        remaining = count - len(all_examples)
        batch = min(batch_size, remaining)

        prompt = CLEAN_PROMPT.format(count=batch)
        response = call_ollama(prompt, model, url)
        sentences = parse_json_array(response)

        for text in sentences:
            all_examples.append({
                "text": text.strip(),
                "label": "none",
                "source": "distillation_clean",
            })

        if not sentences:
            break
        time.sleep(0.5)

    return all_examples[:count]


def merge_with_v1_data(distilled: list[dict], v1_data_dir: Path) -> list[dict]:
    """Merge distilled data with original v1 training data for continuity."""
    merged = list(distilled)

    for split in ["train.json", "val.json"]:
        v1_path = v1_data_dir / split
        if v1_path.exists():
            with open(v1_path, encoding="utf-8") as f:
                v1_data = json.load(f)
            # Only include v1 data with labels that exist in v2
            for ex in v1_data:
                if ex["label"] in LABEL_NAMES_V2:
                    merged.append({
                        "text": ex["text"],
                        "label": ex["label"],
                        "source": "v1_original",
                    })

    # Deduplicate
    seen = set()
    unique = []
    for ex in merged:
        key = ex["text"].lower().strip()
        if key not in seen:
            seen.add(key)
            unique.append(ex)

    print(f"  Merged: {len(unique)} unique examples (distilled + v1)")
    return unique


def main():
    parser = argparse.ArgumentParser(description="Generate distillation training data")
    parser.add_argument("--ollama-url", default="http://localhost:11434")
    parser.add_argument("--model", default="llama3.1:8b")
    parser.add_argument("--examples-per-category", type=int, default=50,
                        help="Number of examples to generate per fallacy category")
    parser.add_argument("--clean-examples", type=int, default=200,
                        help="Number of clean (no-fallacy) negative examples")
    parser.add_argument("--skip-generation", action="store_true",
                        help="Skip generation, just re-split existing data")
    args = parser.parse_args()

    output_dir = Path(__file__).parent.parent / "data" / "processed" / "v2"
    output_dir.mkdir(parents=True, exist_ok=True)
    v1_data_dir = Path(__file__).parent.parent / "data" / "processed"

    raw_path = output_dir / "distilled_raw.json"

    if not args.skip_generation:
        # Test connection
        print(f"Testing Ollama connection at {args.ollama_url}...")
        try:
            resp = requests.get(f"{args.ollama_url}/api/tags", timeout=5)
            resp.raise_for_status()
            models = [m["name"] for m in resp.json().get("models", [])]
            print(f"  Connected! Available models: {', '.join(models[:5])}")
        except Exception as e:
            print(f"  Error: Cannot connect to Ollama: {e}")
            print("  Make sure Ollama is running: ollama serve")
            return

        # Generate examples for each category
        all_examples = []
        for i, category in enumerate(LABEL_NAMES_V2):
            desc = CATEGORY_DESCRIPTIONS[category]
            print(f"[{i + 1}/{len(LABEL_NAMES_V2)}] Generating {args.examples_per_category} examples for: {category}")
            examples = generate_examples_for_category(
                category, desc, args.examples_per_category, args.model, args.ollama_url
            )
            all_examples.extend(examples)
            print(f"  → Got {len(examples)} examples")

        # Generate clean examples
        print(f"\nGenerating {args.clean_examples} clean (no-fallacy) examples...")
        clean = generate_clean_examples(args.clean_examples, args.model, args.ollama_url)
        all_examples.extend(clean)
        print(f"  → Got {len(clean)} clean examples")

        # Save raw generated data
        with open(raw_path, "w", encoding="utf-8") as f:
            json.dump(all_examples, f, indent=2, ensure_ascii=False)
        print(f"\nRaw distilled data saved to {raw_path}")
    else:
        print("Loading existing generated data...")
        with open(raw_path, encoding="utf-8") as f:
            all_examples = json.load(f)

    # Merge with v1 data
    print("\nMerging with v1 training data...")
    all_examples = merge_with_v1_data(all_examples, v1_data_dir)

    # Filter out "none" label for training (we use it only for the classifier to see clean text)
    # Actually, we'll keep "none" — the model should learn to NOT flag clean text
    # But our classifier doesn't have a "none" label, so we'll exclude it
    # The model will learn from the diversity of the data
    labeled_examples = [ex for ex in all_examples if ex["label"] != "none"]
    clean_examples = [ex for ex in all_examples if ex["label"] == "none"]
    print(f"  Labeled examples: {len(labeled_examples)}")
    print(f"  Clean examples (excluded from training): {len(clean_examples)}")

    # Create splits
    labels = [ex["label"] for ex in labeled_examples]
    train_data, temp_data, train_labels, temp_labels = train_test_split(
        labeled_examples, labels, test_size=0.2, stratify=labels, random_state=42
    )
    val_data, test_data = train_test_split(
        temp_data, test_size=0.5, stratify=temp_labels, random_state=42
    )

    # Print distribution
    counter = Counter(ex["label"] for ex in train_data)
    print(f"\nTrain distribution ({len(train_data)} total):")
    for label in LABEL_NAMES_V2:
        count = counter.get(label, 0)
        if count > 0:
            print(f"  {label:30s}: {count:5d}")

    print(f"Validation: {len(val_data)}, Test: {len(test_data)}")

    # Save splits
    for data, name in [(train_data, "train"), (val_data, "val"), (test_data, "test")]:
        path = output_dir / f"{name}.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"  Saved {len(data)} examples to {path}")

    # Save v2 label map
    label_map = {label: i for i, label in enumerate(LABEL_NAMES_V2)}
    with open(output_dir / "label_map_v2.json", "w", encoding="utf-8") as f:
        json.dump(label_map, f, indent=2)
    print(f"  Label map saved ({len(label_map)} categories)")

    # Save generation stats
    stats = {
        "total_examples": len(labeled_examples),
        "categories": len(LABEL_NAMES_V2),
        "examples_per_category_target": args.examples_per_category,
        "v1_examples_merged": sum(1 for ex in labeled_examples if ex.get("source") == "v1_original"),
        "distilled_examples": sum(1 for ex in labeled_examples if ex.get("source") == "distillation"),
        "clean_examples_generated": len(clean_examples),
        "train_size": len(train_data),
        "val_size": len(val_data),
        "test_size": len(test_data),
        "model_used": args.model,
        "distribution": dict(counter),
    }
    with open(output_dir / "generation_stats.json", "w", encoding="utf-8") as f:
        json.dump(stats, f, indent=2)

    print("\nDistillation data generation complete!")
    print(f"Next step: python train_v2.py")


if __name__ == "__main__":
    main()
