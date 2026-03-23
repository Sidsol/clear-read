"""
train_claim_detector.py — Train a binary claim detector (claim vs neutral)

Uses MiniLM-L6 for a lightweight, fast binary classifier.
Produces comprehensive training charts for class presentation.

Usage:
    python train_claim_detector.py

Outputs:
    output_claim_detector/best_model/
    output_claim_detector/training_metrics.json
    output_claim_detector/charts/
        training_loss_curve.png
        validation_metrics_per_epoch.png
        learning_rate_schedule.png
        confusion_matrix.png
        classification_report.png
        roc_curve.png
        confidence_distribution.png
"""

import json
from pathlib import Path

import numpy as np
import yaml
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns
from datasets import Dataset
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    precision_score,
    recall_score,
    classification_report,
    confusion_matrix,
    roc_curve,
    auc,
)
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    Trainer,
    TrainingArguments,
    EarlyStoppingCallback,
)


# ─── Configuration ────────────────────────────────────────────────
MODEL_NAME = "microsoft/MiniLM-L12-H384-uncased"
NUM_LABELS = 2
MAX_LENGTH = 256
BATCH_SIZE = 32
LEARNING_RATE = 3e-5
EPOCHS = 10
WARMUP_RATIO = 0.1
WEIGHT_DECAY = 0.01


def load_data(data_dir: Path):
    with open(data_dir / "train.json", encoding="utf-8") as f:
        train_data = json.load(f)
    with open(data_dir / "val.json", encoding="utf-8") as f:
        val_data = json.load(f)
    with open(data_dir / "test.json", encoding="utf-8") as f:
        test_data = json.load(f)
    with open(data_dir / "label_map.json", encoding="utf-8") as f:
        label_map = json.load(f)
    return train_data, val_data, test_data, label_map


def tokenize_dataset(data, tokenizer, label_map, max_length):
    texts = [ex["text"] for ex in data]
    labels = [label_map[ex["label"]] for ex in data]
    encodings = tokenizer(texts, truncation=True, padding="max_length", max_length=max_length, return_tensors="np")
    dataset = Dataset.from_dict({
        "input_ids": encodings["input_ids"],
        "attention_mask": encodings["attention_mask"],
        "labels": labels,
    })
    dataset.set_format("torch")
    return dataset


def compute_metrics(eval_pred):
    logits, labels = eval_pred
    predictions = np.argmax(logits, axis=-1)
    probs = np.exp(logits) / np.sum(np.exp(logits), axis=-1, keepdims=True)
    return {
        "accuracy": accuracy_score(labels, predictions),
        "f1_macro": f1_score(labels, predictions, average="macro", zero_division=0),
        "f1_weighted": f1_score(labels, predictions, average="weighted", zero_division=0),
        "precision": precision_score(labels, predictions, average="macro", zero_division=0),
        "recall": recall_score(labels, predictions, average="macro", zero_division=0),
    }


def plot_training_charts(trainer, test_data, tokenizer, label_map, model, charts_dir: Path):
    """Generate comprehensive training and evaluation charts."""
    charts_dir.mkdir(parents=True, exist_ok=True)
    id_to_label = {v: k for k, v in label_map.items()}
    label_names = [id_to_label[i] for i in range(len(id_to_label))]

    log_history = trainer.state.log_history

    # ─── 1. Training & Validation Loss Curve ─────────────────────
    train_losses = [(entry["step"], entry["loss"]) for entry in log_history if "loss" in entry and "eval_loss" not in entry]
    eval_entries = [entry for entry in log_history if "eval_loss" in entry]
    eval_epochs = [entry.get("epoch", i+1) for i, entry in enumerate(eval_entries)]
    eval_losses = [entry["eval_loss"] for entry in eval_entries]

    fig, ax1 = plt.subplots(figsize=(10, 5))
    if train_losses:
        steps, losses = zip(*train_losses)
        ax1.plot(steps, losses, alpha=0.4, color="#3b82f6", label="Training Loss")
    ax1.set_xlabel("Training Steps")
    ax1.set_ylabel("Loss", color="#3b82f6")
    ax1.tick_params(axis="y", labelcolor="#3b82f6")

    if eval_losses:
        ax2 = ax1.twinx()
        # Map epochs to approximate steps
        steps_per_epoch = max(steps) / max(eval_epochs) if train_losses and eval_epochs else 1
        eval_steps = [e * steps_per_epoch for e in eval_epochs]
        ax2.plot(eval_steps, eval_losses, "o-", color="#ef4444", linewidth=2, label="Validation Loss")
        ax2.set_ylabel("Validation Loss", color="#ef4444")
        ax2.tick_params(axis="y", labelcolor="#ef4444")

    ax1.set_title("Training & Validation Loss", fontsize=14, fontweight="bold")
    fig.legend(loc="upper right", bbox_to_anchor=(0.95, 0.95))
    plt.tight_layout()
    plt.savefig(charts_dir / "training_loss_curve.png", dpi=150)
    plt.close()

    # ─── 2. Validation Metrics Per Epoch ──────────────────────────
    metrics_to_plot = ["eval_accuracy", "eval_f1_macro", "eval_precision", "eval_recall"]
    metric_labels = ["Accuracy", "Macro F1", "Precision", "Recall"]
    colors = ["#2563eb", "#16a34a", "#ea580c", "#9333ea"]

    fig, ax = plt.subplots(figsize=(10, 5))
    for metric, label, color in zip(metrics_to_plot, metric_labels, colors):
        values = [entry.get(metric) for entry in eval_entries if entry.get(metric) is not None]
        if values:
            epochs = list(range(1, len(values) + 1))
            ax.plot(epochs, values, "o-", color=color, linewidth=2, markersize=6, label=label)

    ax.set_xlabel("Epoch", fontsize=12)
    ax.set_ylabel("Score", fontsize=12)
    ax.set_title("Validation Metrics Per Epoch", fontsize=14, fontweight="bold")
    ax.legend(fontsize=11)
    ax.set_ylim(0, 1.05)
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(charts_dir / "validation_metrics_per_epoch.png", dpi=150)
    plt.close()

    # ─── 3. Learning Rate Schedule ────────────────────────────────
    lr_entries = [(entry["step"], entry["learning_rate"]) for entry in log_history if "learning_rate" in entry]
    if lr_entries:
        steps, lrs = zip(*lr_entries)
        fig, ax = plt.subplots(figsize=(10, 4))
        ax.plot(steps, lrs, color="#0891b2", linewidth=2)
        ax.set_xlabel("Training Steps", fontsize=12)
        ax.set_ylabel("Learning Rate", fontsize=12)
        ax.set_title("Learning Rate Schedule", fontsize=14, fontweight="bold")
        ax.ticklabel_format(axis="y", style="scientific", scilimits=(0, 0))
        ax.grid(True, alpha=0.3)
        plt.tight_layout()
        plt.savefig(charts_dir / "learning_rate_schedule.png", dpi=150)
        plt.close()

    # ─── 4. Test Set Evaluation ───────────────────────────────────
    from transformers import pipeline as hf_pipeline
    classifier = hf_pipeline("text-classification", model=model, tokenizer=tokenizer, top_k=None)

    texts = [ex["text"] for ex in test_data]
    true_labels = [ex["label"] for ex in test_data]

    print("\n  Running test set predictions...")
    predictions = classifier(texts, batch_size=32, truncation=True, max_length=MAX_LENGTH)

    pred_labels = []
    pred_probs = []
    for pred in predictions:
        best = max(pred, key=lambda x: x["score"])
        pred_labels.append(best["label"])
        # Get probability of "claim" class
        claim_prob = next((p["score"] for p in pred if p["label"] == "claim"), 0)
        pred_probs.append(claim_prob)

    # ─── 5. Confusion Matrix ─────────────────────────────────────
    cm = confusion_matrix(true_labels, pred_labels, labels=label_names)
    fig, ax = plt.subplots(figsize=(7, 6))
    sns.heatmap(cm, annot=True, fmt="d", cmap="Blues",
                xticklabels=label_names, yticklabels=label_names, ax=ax,
                annot_kws={"size": 16})
    ax.set_xlabel("Predicted", fontsize=12)
    ax.set_ylabel("True", fontsize=12)
    ax.set_title("Claim Detector — Confusion Matrix", fontsize=14, fontweight="bold")
    plt.tight_layout()
    plt.savefig(charts_dir / "confusion_matrix.png", dpi=150)
    plt.close()

    # ─── 6. Classification Report as Chart ────────────────────────
    report = classification_report(true_labels, pred_labels, labels=label_names, output_dict=True, zero_division=0)

    fig, ax = plt.subplots(figsize=(8, 4))
    metrics = ["precision", "recall", "f1-score"]
    x = np.arange(len(label_names))
    width = 0.25
    for i, metric in enumerate(metrics):
        values = [report[label][metric] for label in label_names]
        bars = ax.bar(x + i * width, values, width, label=metric.title(),
                      color=colors[i], alpha=0.85)
        for bar, val in zip(bars, values):
            ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.02,
                    f"{val:.2f}", ha="center", fontsize=9)

    ax.set_xlabel("Class")
    ax.set_ylabel("Score")
    ax.set_title("Claim Detector — Per-Class Metrics", fontsize=14, fontweight="bold")
    ax.set_xticks(x + width)
    ax.set_xticklabels(label_names, fontsize=11)
    ax.legend()
    ax.set_ylim(0, 1.15)
    plt.tight_layout()
    plt.savefig(charts_dir / "classification_report.png", dpi=150)
    plt.close()

    # ─── 7. ROC Curve ─────────────────────────────────────────────
    true_binary = [1 if l == "claim" else 0 for l in true_labels]
    fpr, tpr, thresholds = roc_curve(true_binary, pred_probs)
    roc_auc = auc(fpr, tpr)

    fig, ax = plt.subplots(figsize=(7, 6))
    ax.plot(fpr, tpr, color="#2563eb", linewidth=2, label=f"ROC Curve (AUC = {roc_auc:.3f})")
    ax.plot([0, 1], [0, 1], color="#94a3b8", linestyle="--", linewidth=1)
    ax.set_xlabel("False Positive Rate", fontsize=12)
    ax.set_ylabel("True Positive Rate", fontsize=12)
    ax.set_title("Claim Detector — ROC Curve", fontsize=14, fontweight="bold")
    ax.legend(fontsize=12)
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(charts_dir / "roc_curve.png", dpi=150)
    plt.close()

    # ─── 8. Confidence Distribution ───────────────────────────────
    correct_probs = [p for p, t, pr in zip(pred_probs, true_labels, pred_labels) if t == pr]
    incorrect_probs = [p for p, t, pr in zip(pred_probs, true_labels, pred_labels) if t != pr]

    fig, ax = plt.subplots(figsize=(8, 5))
    if correct_probs:
        ax.hist(correct_probs, bins=20, alpha=0.7, color="#16a34a", label=f"Correct ({len(correct_probs)})")
    if incorrect_probs:
        ax.hist(incorrect_probs, bins=20, alpha=0.7, color="#ef4444", label=f"Incorrect ({len(incorrect_probs)})")
    ax.set_xlabel("Predicted Probability (Claim Class)", fontsize=12)
    ax.set_ylabel("Count", fontsize=12)
    ax.set_title("Claim Detector — Confidence Distribution", fontsize=14, fontweight="bold")
    ax.legend(fontsize=11)
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig(charts_dir / "confidence_distribution.png", dpi=150)
    plt.close()

    # ─── Save metrics ─────────────────────────────────────────────
    test_metrics = {
        "accuracy": report["accuracy"],
        "macro_f1": report["macro avg"]["f1-score"],
        "weighted_f1": report["weighted avg"]["f1-score"],
        "roc_auc": roc_auc,
        "per_class": {label: report[label] for label in label_names},
        "test_samples": len(test_data),
        "correct": len(correct_probs),
        "incorrect": len(incorrect_probs),
    }

    return report, test_metrics


def main():
    data_dir = Path(__file__).parent.parent / "data" / "processed" / "claim_detector"
    output_dir = Path(__file__).parent.parent / "output_claim_detector"
    charts_dir = output_dir / "charts"
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load data
    train_data, val_data, test_data, label_map = load_data(data_dir)
    id_to_label = {v: k for k, v in label_map.items()}

    print(f"=== Claim Detector Training ===")
    print(f"Model: {MODEL_NAME}")
    print(f"Training: {len(train_data)}, Validation: {len(val_data)}, Test: {len(test_data)}")
    print(f"Labels: {label_map}")
    print()

    # Load model and tokenizer
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME,
        num_labels=NUM_LABELS,
        id2label=id_to_label,
        label2id=label_map,
    )

    # Tokenize
    train_dataset = tokenize_dataset(train_data, tokenizer, label_map, MAX_LENGTH)
    val_dataset = tokenize_dataset(val_data, tokenizer, label_map, MAX_LENGTH)

    # Training args
    training_args = TrainingArguments(
        output_dir=str(output_dir / "checkpoints"),
        num_train_epochs=EPOCHS,
        per_device_train_batch_size=BATCH_SIZE,
        per_device_eval_batch_size=BATCH_SIZE,
        learning_rate=LEARNING_RATE,
        warmup_ratio=WARMUP_RATIO,
        weight_decay=WEIGHT_DECAY,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="f1_macro",
        greater_is_better=True,
        logging_steps=10,
        report_to="none",
        save_total_limit=2,
    )

    # Train
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        compute_metrics=compute_metrics,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=3)],
    )

    print("Starting training...")
    trainer.train()

    # Save best model
    best_model_dir = output_dir / "best_model"
    trainer.save_model(str(best_model_dir))
    tokenizer.save_pretrained(str(best_model_dir))
    print(f"\nBest model saved to {best_model_dir}")

    # Validation metrics
    val_metrics = trainer.evaluate()
    print(f"\nValidation Metrics:")
    print(f"  Accuracy:  {val_metrics['eval_accuracy']:.4f}")
    print(f"  Macro F1:  {val_metrics['eval_f1_macro']:.4f}")
    print(f"  Precision: {val_metrics['eval_precision']:.4f}")
    print(f"  Recall:    {val_metrics['eval_recall']:.4f}")

    # Generate all charts
    print("\nGenerating charts...")
    report, test_metrics = plot_training_charts(
        trainer, test_data, tokenizer, label_map, model, charts_dir
    )

    print(f"\nTest Metrics:")
    print(f"  Accuracy:  {test_metrics['accuracy']:.4f}")
    print(f"  Macro F1:  {test_metrics['macro_f1']:.4f}")
    print(f"  ROC AUC:   {test_metrics['roc_auc']:.4f}")
    print(f"  Correct:   {test_metrics['correct']}/{test_metrics['test_samples']}")

    # Save all metrics
    all_metrics = {
        "validation": val_metrics,
        "test": test_metrics,
        "config": {
            "model": MODEL_NAME,
            "num_labels": NUM_LABELS,
            "max_length": MAX_LENGTH,
            "batch_size": BATCH_SIZE,
            "learning_rate": LEARNING_RATE,
            "epochs": EPOCHS,
        },
    }
    with open(output_dir / "training_metrics.json", "w", encoding="utf-8") as f:
        json.dump(all_metrics, f, indent=2)

    print(f"\nCharts saved to {charts_dir}")
    print(f"Next step: python export_claim_detector.py")


if __name__ == "__main__":
    main()
