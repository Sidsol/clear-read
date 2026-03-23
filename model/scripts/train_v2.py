"""
train_v2.py — Train the V2 fallacy classifier with LLM-distilled data

Uses the expanded 41-category taxonomy and LLM-generated training data.
Outputs are saved separately from v1 for side-by-side comparison.

Usage:
    python train_v2.py [--config ../configs/training_config_v2.yaml]
"""

import argparse
import json
from pathlib import Path

import numpy as np
import yaml
from datasets import Dataset
from sklearn.metrics import accuracy_score, f1_score
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    EarlyStoppingCallback,
    Trainer,
    TrainingArguments,
)


def load_data(data_dir: Path):
    """Load train/val splits from v2 JSON files."""
    with open(data_dir / "train.json", encoding="utf-8") as f:
        train_data = json.load(f)
    with open(data_dir / "val.json", encoding="utf-8") as f:
        val_data = json.load(f)
    with open(data_dir / "label_map_v2.json", encoding="utf-8") as f:
        label_map = json.load(f)
    return train_data, val_data, label_map


def tokenize_dataset(data, tokenizer, label_map, max_length):
    """Convert raw data to a HuggingFace Dataset with tokenized inputs."""
    texts = [ex["text"] for ex in data]
    labels = [label_map[ex["label"]] for ex in data]

    encodings = tokenizer(
        texts,
        truncation=True,
        padding="max_length",
        max_length=max_length,
        return_tensors="np",
    )

    dataset = Dataset.from_dict({
        "input_ids": encodings["input_ids"],
        "attention_mask": encodings["attention_mask"],
        "labels": labels,
    })
    dataset.set_format("torch")
    return dataset


def compute_metrics(eval_pred):
    """Compute accuracy and macro F1."""
    logits, labels = eval_pred
    predictions = np.argmax(logits, axis=-1)

    return {
        "f1_macro": f1_score(labels, predictions, average="macro", zero_division=0),
        "f1_weighted": f1_score(labels, predictions, average="weighted", zero_division=0),
        "accuracy": accuracy_score(labels, predictions),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--config",
        type=str,
        default=str(Path(__file__).parent.parent / "configs" / "training_config_v2.yaml"),
    )
    args = parser.parse_args()

    # Load config
    with open(args.config, encoding="utf-8") as f:
        config = yaml.safe_load(f)

    data_dir = Path(__file__).parent.parent / "data" / "processed" / "v2"
    output_dir = Path(__file__).parent.parent / "output_v2"
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load data
    train_data, val_data, label_map = load_data(data_dir)
    id_to_label = {v: k for k, v in label_map.items()}

    print(f"=== ClearRead V2 Model Training ===")
    print(f"Training samples: {len(train_data)}")
    print(f"Validation samples: {len(val_data)}")
    print(f"Labels: {len(label_map)} categories")
    print()

    # Load model and tokenizer
    model_name = config["model_name"]
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSequenceClassification.from_pretrained(
        model_name,
        num_labels=config["num_labels"],
        id2label=id_to_label,
        label2id=label_map,
    )

    # Tokenize
    train_dataset = tokenize_dataset(train_data, tokenizer, label_map, config["max_length"])
    val_dataset = tokenize_dataset(val_data, tokenizer, label_map, config["max_length"])

    # Training arguments
    training_args = TrainingArguments(
        output_dir=str(output_dir / "checkpoints"),
        num_train_epochs=config["epochs"],
        per_device_train_batch_size=config["batch_size"],
        per_device_eval_batch_size=config["batch_size"],
        learning_rate=float(config["learning_rate"]),
        warmup_ratio=float(config["warmup_ratio"]),
        weight_decay=float(config["weight_decay"]),
        eval_strategy=config["evaluation_strategy"],
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model=config["metric_for_best_model"],
        greater_is_better=True,
        logging_steps=50,
        report_to="none",
        save_total_limit=2,
    )

    # Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        compute_metrics=compute_metrics,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=2)],
    )

    # Train
    print("Starting training...")
    trainer.train()

    # Save best model
    best_model_dir = output_dir / "best_model"
    trainer.save_model(str(best_model_dir))
    tokenizer.save_pretrained(str(best_model_dir))
    print(f"Best model saved to {best_model_dir}")

    # Final evaluation
    metrics = trainer.evaluate()
    print(f"\nFinal validation metrics:")
    print(f"  Accuracy:    {metrics['eval_accuracy']:.4f}")
    print(f"  Macro F1:    {metrics['eval_f1_macro']:.4f}")
    print(f"  Weighted F1: {metrics['eval_f1_weighted']:.4f}")

    # Save metrics
    with open(output_dir / "training_metrics.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    print(f"\nTraining complete! Model saved to {best_model_dir}")
    print(f"Next step: python evaluate_v2.py")


if __name__ == "__main__":
    main()
