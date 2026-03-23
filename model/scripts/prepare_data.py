"""
prepare_data.py — Data Preparation for ClearRead Fallacy Classifier

Downloads and processes the Logical Fallacies and Propaganda Techniques datasets,
maps them to the 12-category ClearRead taxonomy, and creates stratified splits.

Usage:
    python prepare_data.py

Outputs:
    data/processed/train.json
    data/processed/val.json
    data/processed/test.json
"""

import json
import os
from collections import Counter
from pathlib import Path

import yaml
from datasets import load_dataset
from sklearn.model_selection import train_test_split

# Label mapping from source datasets to ClearRead 12-category taxonomy
LOGICAL_FALLACIES_MAP = {
    "appeal to emotion": None,  # not in our taxonomy
    "faulty generalization": "hasty_generalization",
    "red herring": "red_herring",
    "ad hominem": "ad_hominem",
    "ad populum": "appeal_to_popular_opinion",
    "false causality": "post_hoc",
    "false dilemma": "false_dichotomy",
    "fallacy of extension": "straw_man",
    "fallacy of relevance": "red_herring",
    "fallacy of credibility": "appeal_to_authority",
    "fallacy of logic": "begging_the_question",
    "intentional": "equivocation",
    "circular reasoning": "begging_the_question",
    "equivocation": "equivocation",
    "straw man": "straw_man",
    "appeal to authority": "appeal_to_authority",
    "slippery slope": "slippery_slope",
    "loaded question": "loaded_question",
    "begging the question": "begging_the_question",
}

PROPAGANDA_MAP = {
    "Name_Calling,Labeling": "ad_hominem",
    "Causal_Oversimplification": "post_hoc",
    "Black-and-White_Fallacy": "false_dichotomy",
    "Appeal_to_Authority": "appeal_to_authority",
    "Bandwagon": "appeal_to_popular_opinion",
    "Red_Herring": "red_herring",
    "Exaggeration,Minimisation": "hasty_generalization",
    "Straw_Men": "straw_man",
    "Loaded_Language": None,  # not directly a fallacy
    "Repetition": None,
    "Flag-Waving": None,
    "Doubt": None,
    "Slogans": None,
    "Thought-terminating_Cliches": None,
    "Appeal_to_fear-prejudice": None,
    "Whataboutism": "red_herring",
    "Obfuscation,Intentional_Vagueness,Confusion": "equivocation",
    "Misrepresentation_of_Someone's_Position": "straw_man",
}

LABEL_NAMES = [
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
]


def load_logical_fallacies():
    """Load and map the tasksource/logical-fallacy dataset."""
    print("Loading tasksource/logical-fallacy dataset...")
    # Combine all available splits
    examples = []
    for split in ["train", "test", "dev"]:
        ds = load_dataset("tasksource/logical-fallacy", split=split)
        for row in ds:
            source_label = row.get("logical_fallacies", "").lower().strip()
            mapped = LOGICAL_FALLACIES_MAP.get(source_label)
            if mapped and mapped in LABEL_NAMES:
                examples.append({
                    "text": row["source_article"].strip(),
                    "label": mapped,
                    "source": "logical_fallacies",
                })
    print(f"  \u2192 {len(examples)} examples mapped from logical-fallacy")
    return examples


def deduplicate(examples):
    """Remove duplicate texts."""
    seen = set()
    unique = []
    for ex in examples:
        text_key = ex["text"].lower().strip()
        if text_key not in seen:
            seen.add(text_key)
            unique.append(ex)
    print(f"  → {len(unique)} unique examples after deduplication (removed {len(examples) - len(unique)})")
    return unique


def create_splits(examples, seed=42):
    """Create stratified 80/10/10 train/val/test splits."""
    labels = [ex["label"] for ex in examples]
    train_data, temp_data, train_labels, temp_labels = train_test_split(
        examples, labels, test_size=0.2, stratify=labels, random_state=seed
    )
    val_data, test_data = train_test_split(
        temp_data, test_size=0.5, stratify=temp_labels, random_state=seed
    )
    return train_data, val_data, test_data


def save_split(data, filepath):
    """Save a data split to JSON."""
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"  → Saved {len(data)} examples to {filepath}")


def print_distribution(data, name):
    """Print label distribution for a split."""
    counter = Counter(ex["label"] for ex in data)
    print(f"\n{name} distribution ({len(data)} total):")
    for label in LABEL_NAMES:
        count = counter.get(label, 0)
        print(f"  {label:30s}: {count:5d} ({100 * count / len(data):.1f}%)")


def main():
    output_dir = Path(__file__).parent.parent / "data" / "processed"

    # Load datasets
    examples = load_logical_fallacies()
    # Propaganda dataset requires manual download — add examples if available
    # examples.extend(load_propaganda())

    # Deduplicate
    examples = deduplicate(examples)

    if len(examples) < 100:
        print(f"\nWarning: Only {len(examples)} examples — model quality may be poor.")

    # Create splits
    train_data, val_data, test_data = create_splits(examples)

    # Print distributions
    print_distribution(train_data, "Train")
    print_distribution(val_data, "Validation")
    print_distribution(test_data, "Test")

    # Save
    save_split(train_data, output_dir / "train.json")
    save_split(val_data, output_dir / "val.json")
    save_split(test_data, output_dir / "test.json")

    # Save label mapping for reference
    label_to_id = {label: i for i, label in enumerate(LABEL_NAMES)}
    save_split(label_to_id, output_dir / "label_map.json")

    print("\nData preparation complete!")


if __name__ == "__main__":
    main()
