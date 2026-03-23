"""
evaluate_v2.py — Evaluate V2 model and generate side-by-side comparison with V1

Produces:
  - V2 classification report + confusion matrix
  - Side-by-side metrics table (V1 vs V2)
  - Combined comparison chart for class presentation

Usage:
    python evaluate_v2.py
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


def evaluate_model(model_dir: Path, test_data: list, label_map: dict) -> dict:
    """Evaluate a model on test data and return metrics."""
    id_to_label = {v: k for k, v in label_map.items()}
    label_names = [id_to_label[i] for i in range(len(id_to_label))]

    tokenizer = AutoTokenizer.from_pretrained(str(model_dir))
    model = AutoModelForSequenceClassification.from_pretrained(str(model_dir))
    classifier = pipeline("text-classification", model=model, tokenizer=tokenizer, top_k=None)

    texts = [ex["text"] for ex in test_data]
    true_labels = [ex["label"] for ex in test_data]

    print(f"  Running predictions on {len(texts)} examples...")
    predictions = classifier(texts, batch_size=16, truncation=True, max_length=256)

    pred_labels = []
    pred_confidences = []
    for pred in predictions:
        best = max(pred, key=lambda x: x["score"])
        pred_labels.append(best["label"])
        pred_confidences.append(best["score"])

    # Only evaluate on labels present in both true and predicted
    present_labels = sorted(set(true_labels) | set(pred_labels))
    present_labels = [l for l in label_names if l in present_labels]

    report = classification_report(
        true_labels, pred_labels, labels=present_labels, output_dict=True, zero_division=0
    )

    return {
        "report": report,
        "true_labels": true_labels,
        "pred_labels": pred_labels,
        "pred_confidences": pred_confidences,
        "label_names": present_labels,
        "texts": texts,
    }


def main():
    base_dir = Path(__file__).parent.parent

    # ─── V1 Evaluation ───────────────────────────────────────────────
    v1_model_dir = base_dir / "output" / "best_model"
    v1_data_dir = base_dir / "data" / "processed"
    v1_output_dir = base_dir / "output" / "evaluation"

    # ─── V2 Evaluation ───────────────────────────────────────────────
    v2_model_dir = base_dir / "output_v2" / "best_model"
    v2_data_dir = base_dir / "data" / "processed" / "v2"
    v2_output_dir = base_dir / "output_v2" / "evaluation"
    v2_output_dir.mkdir(parents=True, exist_ok=True)

    comparison_dir = base_dir / "output_v2" / "comparison"
    comparison_dir.mkdir(parents=True, exist_ok=True)

    # Check which versions are available
    has_v1 = v1_model_dir.exists() and (v1_data_dir / "test.json").exists()
    has_v2 = v2_model_dir.exists() and (v2_data_dir / "test.json").exists()

    if not has_v2:
        print("Error: V2 model not found. Run train_v2.py first.")
        return

    # ─── Evaluate V2 ─────────────────────────────────────────────────
    print("=== Evaluating V2 Model ===")
    with open(v2_data_dir / "test.json", encoding="utf-8") as f:
        v2_test = json.load(f)
    with open(v2_data_dir / "label_map_v2.json", encoding="utf-8") as f:
        v2_label_map = json.load(f)

    v2_results = evaluate_model(v2_model_dir, v2_test, v2_label_map)

    # Save V2 classification report
    with open(v2_output_dir / "classification_report.json", "w", encoding="utf-8") as f:
        json.dump(v2_results["report"], f, indent=2)

    # Print V2 report
    print("\nV2 Classification Report:")
    print(classification_report(
        v2_results["true_labels"], v2_results["pred_labels"],
        labels=v2_results["label_names"], zero_division=0
    ))

    # V2 confusion matrix
    cm_v2 = confusion_matrix(
        v2_results["true_labels"], v2_results["pred_labels"],
        labels=v2_results["label_names"]
    )
    fig, ax = plt.subplots(figsize=(20, 18))
    sns.heatmap(cm_v2, annot=True, fmt="d", cmap="Blues",
                xticklabels=v2_results["label_names"],
                yticklabels=v2_results["label_names"], ax=ax)
    ax.set_xlabel("Predicted")
    ax.set_ylabel("True")
    ax.set_title("V2 Model — Confusion Matrix (41 categories)")
    plt.xticks(rotation=45, ha="right", fontsize=7)
    plt.yticks(rotation=0, fontsize=7)
    plt.tight_layout()
    plt.savefig(v2_output_dir / "confusion_matrix.png", dpi=150)
    plt.close()
    print(f"V2 confusion matrix saved to {v2_output_dir / 'confusion_matrix.png'}")

    # V2 error analysis
    errors = []
    for i, (true, pred) in enumerate(zip(v2_results["true_labels"], v2_results["pred_labels"])):
        if true != pred:
            errors.append({
                "text": v2_results["texts"][i][:300],
                "true_label": true,
                "predicted_label": pred,
                "confidence": round(v2_results["pred_confidences"][i], 4),
            })
    with open(v2_output_dir / "error_analysis.json", "w", encoding="utf-8") as f:
        json.dump(errors, f, indent=2, ensure_ascii=False)

    # ─── Side-by-Side Comparison ──────────────────────────────────────
    if has_v1:
        print("\n=== V1 vs V2 Comparison ===")
        with open(v1_data_dir / "test.json", encoding="utf-8") as f:
            v1_test = json.load(f)
        with open(v1_data_dir / "label_map.json", encoding="utf-8") as f:
            v1_label_map = json.load(f)

        print("\nEvaluating V1 Model...")
        v1_results = evaluate_model(v1_model_dir, v1_test, v1_label_map)

        # Summary comparison
        v1_report = v1_results["report"]
        v2_report = v2_results["report"]

        comparison = {
            "v1": {
                "categories": len(v1_label_map),
                "test_samples": len(v1_test),
                "accuracy": round(v1_report.get("accuracy", 0), 4),
                "macro_f1": round(v1_report.get("macro avg", {}).get("f1-score", 0), 4),
                "weighted_f1": round(v1_report.get("weighted avg", {}).get("f1-score", 0), 4),
                "training_data": "Original HuggingFace dataset (3,217 examples)",
                "model": "distilroberta-base",
            },
            "v2": {
                "categories": len(v2_label_map),
                "test_samples": len(v2_test),
                "accuracy": round(v2_report.get("accuracy", 0), 4),
                "macro_f1": round(v2_report.get("macro avg", {}).get("f1-score", 0), 4),
                "weighted_f1": round(v2_report.get("weighted avg", {}).get("f1-score", 0), 4),
                "training_data": "LLM-distilled + original data",
                "model": "distilroberta-base",
            },
            "improvements": {},
        }

        # Per-category comparison (for shared categories)
        shared_labels = sorted(set(v1_label_map.keys()) & set(v2_label_map.keys()))
        per_category = {}
        for label in shared_labels:
            v1_f1 = v1_report.get(label, {}).get("f1-score", 0)
            v2_f1 = v2_report.get(label, {}).get("f1-score", 0)
            per_category[label] = {
                "v1_f1": round(v1_f1, 4),
                "v2_f1": round(v2_f1, 4),
                "improvement": round(v2_f1 - v1_f1, 4),
            }
        comparison["per_category"] = per_category

        # New categories in V2
        new_categories = sorted(set(v2_label_map.keys()) - set(v1_label_map.keys()))
        new_cat_metrics = {}
        for label in new_categories:
            f1 = v2_report.get(label, {}).get("f1-score", 0)
            support = v2_report.get(label, {}).get("support", 0)
            new_cat_metrics[label] = {"f1": round(f1, 4), "support": int(support)}
        comparison["new_categories_v2"] = new_cat_metrics

        with open(comparison_dir / "v1_vs_v2.json", "w", encoding="utf-8") as f:
            json.dump(comparison, f, indent=2)

        # Print summary
        print(f"\n{'Metric':<25} {'V1':>10} {'V2':>10} {'Change':>10}")
        print("-" * 55)
        print(f"{'Categories':<25} {comparison['v1']['categories']:>10} {comparison['v2']['categories']:>10} {'':>10}")
        print(f"{'Test Samples':<25} {comparison['v1']['test_samples']:>10} {comparison['v2']['test_samples']:>10} {'':>10}")
        print(f"{'Accuracy':<25} {comparison['v1']['accuracy']:>10.4f} {comparison['v2']['accuracy']:>10.4f} {comparison['v2']['accuracy'] - comparison['v1']['accuracy']:>+10.4f}")
        print(f"{'Macro F1':<25} {comparison['v1']['macro_f1']:>10.4f} {comparison['v2']['macro_f1']:>10.4f} {comparison['v2']['macro_f1'] - comparison['v1']['macro_f1']:>+10.4f}")
        print(f"{'Weighted F1':<25} {comparison['v1']['weighted_f1']:>10.4f} {comparison['v2']['weighted_f1']:>10.4f} {comparison['v2']['weighted_f1'] - comparison['v1']['weighted_f1']:>+10.4f}")

        # ─── Comparison Charts ────────────────────────────────────────
        # Chart 1: Overall metrics bar chart
        fig, axes = plt.subplots(1, 2, figsize=(14, 5))

        # Overall metrics
        metrics_names = ["Accuracy", "Macro F1", "Weighted F1"]
        v1_vals = [comparison["v1"]["accuracy"], comparison["v1"]["macro_f1"], comparison["v1"]["weighted_f1"]]
        v2_vals = [comparison["v2"]["accuracy"], comparison["v2"]["macro_f1"], comparison["v2"]["weighted_f1"]]

        x = np.arange(len(metrics_names))
        width = 0.35
        axes[0].bar(x - width/2, v1_vals, width, label="V1 (Original)", color="#94a3b8", alpha=0.8)
        axes[0].bar(x + width/2, v2_vals, width, label="V2 (Distilled)", color="#2563eb", alpha=0.8)
        axes[0].set_ylabel("Score")
        axes[0].set_title("Overall Metrics: V1 vs V2")
        axes[0].set_xticks(x)
        axes[0].set_xticklabels(metrics_names)
        axes[0].legend()
        axes[0].set_ylim(0, 1)

        # Per-category F1 comparison (shared categories only)
        if shared_labels:
            v1_f1s = [per_category[l]["v1_f1"] for l in shared_labels]
            v2_f1s = [per_category[l]["v2_f1"] for l in shared_labels]
            x2 = np.arange(len(shared_labels))
            axes[1].barh(x2 - width/2, v1_f1s, width, label="V1", color="#94a3b8", alpha=0.8)
            axes[1].barh(x2 + width/2, v2_f1s, width, label="V2", color="#2563eb", alpha=0.8)
            axes[1].set_xlabel("F1 Score")
            axes[1].set_title("Per-Category F1: V1 vs V2 (Shared Categories)")
            axes[1].set_yticks(x2)
            axes[1].set_yticklabels(shared_labels, fontsize=8)
            axes[1].legend()
            axes[1].set_xlim(0, 1)

        plt.tight_layout()
        plt.savefig(comparison_dir / "v1_vs_v2_chart.png", dpi=150)
        plt.close()
        print(f"\nComparison chart saved to {comparison_dir / 'v1_vs_v2_chart.png'}")

        # Chart 2: V2 new categories performance
        if new_categories:
            fig, ax = plt.subplots(figsize=(12, 8))
            new_f1s = [new_cat_metrics[l]["f1"] for l in new_categories]
            colors = ["#2563eb" if f > 0.5 else "#f59e0b" if f > 0.3 else "#ef4444" for f in new_f1s]
            ax.barh(new_categories, new_f1s, color=colors, alpha=0.8)
            ax.set_xlabel("F1 Score")
            ax.set_title("V2 New Categories — Performance")
            ax.set_xlim(0, 1)
            plt.tight_layout()
            plt.savefig(comparison_dir / "v2_new_categories.png", dpi=150)
            plt.close()
            print(f"New categories chart saved to {comparison_dir / 'v2_new_categories.png'}")

    else:
        print("\nV1 model not found — skipping side-by-side comparison.")
        print("To compare, ensure model/output/best_model/ contains the V1 model.")

    print(f"\nV2 Accuracy: {v2_results['report']['accuracy']:.4f}")
    print(f"V2 Macro F1: {v2_results['report']['macro avg']['f1-score']:.4f}")
    print(f"\nEvaluation complete!")


if __name__ == "__main__":
    main()
