"""
generate_claim_data.py — Generate training data for the Claim Detector

Uses Ollama to generate labeled sentences:
- "claim": Opinions, assertions, arguments, persuasive statements
- "neutral": Factual reporting, descriptions, neutral observations

The claim detector filters text BEFORE the fallacy classifier,
reducing false positives by only sending argumentative text.

Usage:
    python generate_claim_data.py [--model llama3.1:8b] [--examples 500]

Outputs:
    data/processed/claim_detector/train.json
    data/processed/claim_detector/val.json
    data/processed/claim_detector/test.json
    data/processed/claim_detector/label_map.json
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

CLAIM_PROMPT = """Generate {count} diverse sentences that are CLAIMS, OPINIONS, or ARGUMENTATIVE STATEMENTS.

These should include:
- Political opinions and assertions
- Persuasive arguments trying to convince the reader
- Value judgments ("X is better than Y", "This policy is wrong")
- Predictions presented as certain facts
- Controversial or debatable assertions
- Emotional appeals and loaded statements
- Generalizations about groups or topics
- Calls to action

Requirements:
- Each should be 1-3 sentences
- Vary topics: politics, health, technology, environment, economics, social issues
- Mix obvious claims with subtle ones
- Some should use strong language, others should be more measured
- Include some that could be mistaken for facts but are actually opinions

Return ONLY a JSON array of strings. No markdown, no explanation."""

NEUTRAL_PROMPT = """Generate {count} diverse sentences that are NEUTRAL, FACTUAL, or DESCRIPTIVE.

These should include:
- News reporting (who, what, when, where without editorializing)
- Scientific facts and data summaries
- Event descriptions and timelines
- Direct quotes attributed to sources
- Statistical data presented neutrally
- Weather reports, sports scores, meeting summaries
- Navigation text, captions, bylines, headers
- Procedural descriptions ("The committee met on Tuesday")
- Citations and references

Requirements:
- Each should be 1-3 sentences
- Vary topics and styles
- MUST NOT contain opinions, judgments, or persuasive language
- Some should be about controversial topics but stated neutrally
- Include some that look like claims but are actually factual

Return ONLY a JSON array of strings. No markdown, no explanation."""


def call_ollama(prompt: str, model: str, url: str, max_retries: int = 3) -> str:
    for attempt in range(max_retries):
        try:
            resp = requests.post(
                f"{url}/api/chat",
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "stream": False,
                    "options": {"num_ctx": 8192},
                },
                timeout=180,
            )
            if resp.status_code == 200:
                data = resp.json()
                return data.get("message", {}).get("content", "")
            else:
                print(f"  Ollama returned {resp.status_code}, retrying ({attempt + 1}/{max_retries})...")
                time.sleep(3)
        except requests.exceptions.RequestException as e:
            print(f"  Request failed: {e}, retrying ({attempt + 1}/{max_retries})...")
            time.sleep(3)
    return ""


def parse_json_array(text: str) -> list[str]:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
    if text.endswith("```"):
        text = text.rsplit("```", 1)[0]
    text = text.strip()

    # Try JSON array
    start = text.find("[")
    end = text.rfind("]")
    if start != -1 and end > start:
        try:
            result = json.loads(text[start:end + 1])
            if isinstance(result, list):
                return [s for s in result if isinstance(s, str) and len(s.strip()) > 10]
        except json.JSONDecodeError:
            pass

    # Try JSON object (keys as examples)
    obj_start = text.find("{")
    obj_end = text.rfind("}")
    if obj_start != -1 and obj_end > obj_start:
        try:
            result = json.loads(text[obj_start:obj_end + 1])
            if isinstance(result, dict):
                return [k for k in result.keys() if isinstance(k, str) and len(k.strip()) > 10]
        except json.JSONDecodeError:
            pass

    # Fallback: split by newlines
    import re
    lines = []
    for line in text.split("\n"):
        line = line.strip().strip('"').strip("'").strip(",").strip()
        line = re.sub(r'^\d+\.\s*', '', line)
        line = re.sub(r'^[-*]\s*', '', line)
        if len(line) > 10:
            lines.append(line)
    return lines


def generate_examples(prompt_template: str, label: str, total: int, batch_size: int, model: str, url: str) -> list[dict]:
    all_examples = []
    while len(all_examples) < total:
        remaining = total - len(all_examples)
        batch = min(batch_size, remaining)
        prompt = prompt_template.format(count=batch)
        response = call_ollama(prompt, model, url)
        sentences = parse_json_array(response)
        for text in sentences:
            all_examples.append({"text": text.strip(), "label": label, "source": "distillation"})
        if not sentences:
            print(f"    Warning: empty response, skipping batch")
            break
        print(f"    Generated {len(sentences)} {label} examples (total: {len(all_examples)})")
        time.sleep(0.5)
    return all_examples[:total]


def main():
    parser = argparse.ArgumentParser(description="Generate claim detector training data")
    parser.add_argument("--ollama-url", default="http://localhost:11434")
    parser.add_argument("--model", default="llama3.1:8b")
    parser.add_argument("--examples", type=int, default=500,
                        help="Number of examples per class (claim/neutral)")
    args = parser.parse_args()

    output_dir = Path(__file__).parent.parent / "data" / "processed" / "claim_detector"
    output_dir.mkdir(parents=True, exist_ok=True)

    # Test connection
    print(f"Testing Ollama at {args.ollama_url}...")
    try:
        resp = requests.get(f"{args.ollama_url}/api/tags", timeout=5)
        resp.raise_for_status()
        print(f"  Connected!")
    except Exception as e:
        print(f"  Error: {e}")
        return

    # Generate claim examples
    print(f"\nGenerating {args.examples} CLAIM examples...")
    claims = generate_examples(CLAIM_PROMPT, "claim", args.examples, 25, args.model, args.ollama_url)

    # Generate neutral examples
    print(f"\nGenerating {args.examples} NEUTRAL examples...")
    neutrals = generate_examples(NEUTRAL_PROMPT, "neutral", args.examples, 25, args.model, args.ollama_url)

    all_examples = claims + neutrals
    random.shuffle(all_examples)

    # Deduplicate
    seen = set()
    unique = []
    for ex in all_examples:
        key = ex["text"].lower().strip()
        if key not in seen:
            seen.add(key)
            unique.append(ex)
    all_examples = unique
    print(f"\nTotal unique examples: {len(all_examples)}")

    # Split
    labels = [ex["label"] for ex in all_examples]
    train_data, temp_data, train_labels, temp_labels = train_test_split(
        all_examples, labels, test_size=0.2, stratify=labels, random_state=42
    )
    val_data, test_data = train_test_split(
        temp_data, test_size=0.5, stratify=temp_labels, random_state=42
    )

    # Print stats
    for name, data in [("Train", train_data), ("Val", val_data), ("Test", test_data)]:
        counter = Counter(ex["label"] for ex in data)
        print(f"  {name}: {len(data)} (claim: {counter['claim']}, neutral: {counter['neutral']})")

    # Save
    for data, name in [(train_data, "train"), (val_data, "val"), (test_data, "test")]:
        path = output_dir / f"{name}.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    # Label map
    label_map = {"claim": 0, "neutral": 1}
    with open(output_dir / "label_map.json", "w", encoding="utf-8") as f:
        json.dump(label_map, f, indent=2)

    print(f"\nData saved to {output_dir}")
    print("Next step: python train_claim_detector.py")


if __name__ == "__main__":
    main()
