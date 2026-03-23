"""
export_onnx.py — Export the trained model to ONNX and apply INT8 quantization

Usage:
    python export_onnx.py
"""

import json
from pathlib import Path

import numpy as np
from optimum.exporters.onnx import main_export
from optimum.onnxruntime import ORTQuantizer
from optimum.onnxruntime.configuration import AutoQuantizationConfig
from transformers import AutoTokenizer, pipeline


def main():
    model_dir = Path(__file__).parent.parent / "output" / "best_model"
    onnx_dir = Path(__file__).parent.parent / "output" / "onnx"
    quantized_dir = Path(__file__).parent.parent / "output" / "onnx_quantized"

    # Step 1: Export to ONNX
    print("Exporting model to ONNX...")
    main_export(
        model_name_or_path=str(model_dir),
        output=str(onnx_dir),
        task="text-classification",
    )
    print(f"ONNX model exported to {onnx_dir}")

    # Step 2: Quantize (INT8 dynamic)
    print("Applying INT8 dynamic quantization...")
    quantizer = ORTQuantizer.from_pretrained(str(onnx_dir))
    qconfig = AutoQuantizationConfig.avx512_vnni(is_static=False, per_channel=False)
    quantizer.quantize(save_dir=str(quantized_dir), quantization_config=qconfig)
    print(f"Quantized model saved to {quantized_dir}")

    # Step 3: Validate output parity
    print("Validating output parity...")
    tokenizer = AutoTokenizer.from_pretrained(str(model_dir))

    # Original model
    original_pipe = pipeline(
        "text-classification", model=str(model_dir), tokenizer=tokenizer, top_k=None
    )

    # ONNX model
    from optimum.onnxruntime import ORTModelForSequenceClassification

    onnx_model = ORTModelForSequenceClassification.from_pretrained(str(quantized_dir))
    onnx_pipe = pipeline(
        "text-classification", model=onnx_model, tokenizer=tokenizer, top_k=None
    )

    test_texts = [
        "Everyone knows that this policy is terrible, so it must be wrong.",
        "The senator is a liar, so we can't trust their economic plan.",
        "After the new law passed, crime went up. The law clearly caused the increase.",
    ]

    print("\nParity check:")
    for text in test_texts:
        orig_result = original_pipe(text, truncation=True, max_length=256)[0]
        onnx_result = onnx_pipe(text, truncation=True, max_length=256)[0]

        orig_top = max(orig_result, key=lambda x: x["score"])
        onnx_top = max(onnx_result, key=lambda x: x["score"])

        match = orig_top["label"] == onnx_top["label"]
        score_diff = abs(orig_top["score"] - onnx_top["score"])
        print(f"  Text: {text[:60]}...")
        print(f"    Original: {orig_top['label']} ({orig_top['score']:.4f})")
        print(f"    ONNX:     {onnx_top['label']} ({onnx_top['score']:.4f})")
        print(f"    Match: {match}, Score diff: {score_diff:.4f}")

    # Report model sizes
    import os
    orig_size = sum(
        os.path.getsize(f) for f in (model_dir / "model.safetensors",) if f.exists()
    )
    onnx_files = list(quantized_dir.glob("*.onnx"))
    quantized_size = sum(os.path.getsize(f) for f in onnx_files) if onnx_files else 0
    print(f"\nOriginal model size: {orig_size / 1e6:.1f} MB")
    print(f"Quantized ONNX size: {quantized_size / 1e6:.1f} MB")
    print("Export complete!")


if __name__ == "__main__":
    main()
