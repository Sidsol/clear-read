"""
export_onnx_v3.py — Export V3 DeBERTa model to ONNX with INT8 quantization

Usage:
    python export_onnx_v3.py
"""

import os
from pathlib import Path

from optimum.exporters.onnx import main_export
from optimum.onnxruntime import ORTQuantizer
from optimum.onnxruntime.configuration import AutoQuantizationConfig
from transformers import AutoTokenizer, pipeline


def main():
    model_dir = Path(__file__).parent.parent / "output_v3" / "best_model"
    onnx_dir = Path(__file__).parent.parent / "output_v3" / "onnx"
    quantized_dir = Path(__file__).parent.parent / "output_v3" / "onnx_quantized"

    if not model_dir.exists():
        print("Error: V3 model not found. Run train_v3.py first.")
        return

    # Step 1: Export to ONNX
    print("Exporting V3 model to ONNX...")
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

    # Step 3: Validate
    print("Validating output parity...")
    tokenizer = AutoTokenizer.from_pretrained(str(model_dir))

    original_pipe = pipeline(
        "text-classification", model=str(model_dir), tokenizer=tokenizer, top_k=None, device="cpu"
    )

    from optimum.onnxruntime import ORTModelForSequenceClassification
    onnx_model = ORTModelForSequenceClassification.from_pretrained(
        str(quantized_dir), file_name="model_quantized.onnx", provider="CPUExecutionProvider"
    )
    onnx_pipe = pipeline(
        "text-classification", model=onnx_model, tokenizer=tokenizer, top_k=None, device="cpu"
    )

    test_texts = [
        "Everyone knows that this policy is terrible, so it must be wrong.",
        "The senator is a liar, so we can't trust their economic plan.",
        "If we allow this, next thing you know, total chaos will ensue.",
        "My friend tried that diet and it worked, so it must be effective for everyone.",
        "You can't prove it doesn't work, so it must be effective.",
    ]

    print("\nParity check:")
    matches = 0
    for text in test_texts:
        orig_result = original_pipe(text, truncation=True, max_length=256)[0]
        onnx_result = onnx_pipe(text, truncation=True, max_length=256)[0]

        orig_top = max(orig_result, key=lambda x: x["score"])
        onnx_top = max(onnx_result, key=lambda x: x["score"])

        match = orig_top["label"] == onnx_top["label"]
        matches += int(match)
        score_diff = abs(orig_top["score"] - onnx_top["score"])
        print(f"  Text: {text[:60]}...")
        print(f"    Original: {orig_top['label']} ({orig_top['score']:.4f})")
        print(f"    ONNX:     {onnx_top['label']} ({onnx_top['score']:.4f})")
        print(f"    Match: {match}, Score diff: {score_diff:.4f}")

    print(f"\nParity: {matches}/{len(test_texts)} labels match")

    # Report sizes
    safetensors = model_dir / "model.safetensors"
    orig_size = os.path.getsize(safetensors) if safetensors.exists() else 0
    onnx_files = list(quantized_dir.glob("*.onnx"))
    quantized_size = sum(os.path.getsize(f) for f in onnx_files)
    print(f"\nOriginal model size: {orig_size / 1e6:.1f} MB")
    print(f"Quantized ONNX size: {quantized_size / 1e6:.1f} MB")
    print(f"\nTo deploy: copy {quantized_dir}/* to extension/public/model/")
    print("Export complete!")


if __name__ == "__main__":
    main()
