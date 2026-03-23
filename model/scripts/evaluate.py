"""
evaluate.py — Evaluate the trained fallacy classifier

Generates confusion matrix, per-class precision/recall/F1, and error analysis.

Usage:
    python evaluate.py
"""

import json
from pathlib import Path

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import classification_report, confusion_matrix
from transformers import AutoModelForSequenceClassification, AutoTokenizer, pipeline


def main():
    data_dir = Path(__file__).parent.parent / "data" / "processed"
    model_dir = Path(__file__).parent.parent / "output" / "best_model"
    output_dir = Path(__file__).parent.parent / "output" / "evaluation"
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load test data and label map
    with open(data_dir / "test.json", encoding="utf-8") as f:
        test_data = json.load(f)
    with open(data_dir / "label_map.json", encoding="utf-8") as f:
        label_map = json.load(f)

    id_to_label = {v: k for k, v in label_map.items()}
    label_names = [id_to_label[i] for i in range(len(id_to_label))]

    print(f"Test samples: {len(test_data)}")

    # Load model
    tokenizer = AutoTokenizer.from_pretrained(str(model_dir))
    model = AutoModelForSequenceClassification.from_pretrained(str(model_dir))
    classifier = pipeline("text-classification", model=model, tokenizer=tokenizer, top_k=None)

    # Predict
    texts = [ex["text"] for ex in test_data]
    true_labels = [ex["label"] for ex in test_data]

    print("Running predictions...")
    predictions = classifier(texts, batch_size=16, truncation=True, max_length=256)

    pred_labels = []
    for pred in predictions:
        best = max(pred, key=lambda x: x["score"])
        pred_labels.append(best["label"])

    # Classification report
    report = classification_report(
        true_labels, pred_labels, labels=label_names, output_dict=True
    )
    print("\nClassification Report:")
    print(classification_report(true_labels, pred_labels, labels=label_names))

    with open(output_dir / "classification_report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    # Confusion matrix
    cm = confusion_matrix(true_labels, pred_labels, labels=label_names)

    fig, ax = plt.subplots(figsize=(14, 12))
    sns.heatmap(
        cm,
        annot=True,
        fmt="d",
        cmap="Blues",
        xticklabels=label_names,
        yticklabels=label_names,
        ax=ax,
    )
    ax.set_xlabel("Predicted")
    ax.set_ylabel("True")
    ax.set_title("Fallacy Classification — Confusion Matrix")
    plt.xticks(rotation=45, ha="right")
    plt.yticks(rotation=0)
    plt.tight_layout()
    plt.savefig(output_dir / "confusion_matrix.png", dpi=150)
    print(f"Confusion matrix saved to {output_dir / 'confusion_matrix.png'}")

    # Error analysis — save misclassified examples
    errors = []
    for i, (true, pred) in enumerate(zip(true_labels, pred_labels)):
        if true != pred:
            errors.append({
                "text": texts[i][:300],
                "true_label": true,
                "predicted_label": pred,
            })

    with open(output_dir / "error_analysis.json", "w", encoding="utf-8") as f:
        json.dump(errors, f, indent=2, ensure_ascii=False)

    print(f"\n{len(errors)} misclassified examples saved to error_analysis.json")
    print(f"Accuracy: {report['accuracy']:.4f}")
    print(f"Macro F1: {report['macro avg']['f1-score']:.4f}")


if __name__ == "__main__":
    main()
