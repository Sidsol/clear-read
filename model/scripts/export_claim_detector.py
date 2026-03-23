"""
export_claim_detector.py — Export claim detector to ONNX with INT8 quantization

Usage:
    python export_claim_detector.py
"""

import os
from pathlib import Path

from optimum.exporters.onnx import main_export
from optimum.onnxruntime import ORTQuantizer
from optimum.onnxruntime.configuration import AutoQuantizationConfig


def main():
    model_dir = Path(__file__).parent.parent / "output_claim_detector" / "best_model"
    onnx_dir = Path(__file__).parent.parent / "output_claim_detector" / "onnx"
    quantized_dir = Path(__file__).parent.parent / "output_claim_detector" / "onnx_quantized"

    if not model_dir.exists():
        print("Error: Claim detector model not found. Run train_claim_detector.py first.")
        return

    # Export to ONNX
    print("Exporting claim detector to ONNX...")
    main_export(
        model_name_or_path=str(model_dir),
        output=str(onnx_dir),
        task="text-classification",
    )
    print(f"ONNX model exported to {onnx_dir}")

    # Quantize
    print("Applying INT8 dynamic quantization...")
    quantizer = ORTQuantizer.from_pretrained(str(onnx_dir))
    qconfig = AutoQuantizationConfig.avx512_vnni(is_static=False, per_channel=False)
    quantizer.quantize(save_dir=str(quantized_dir), quantization_config=qconfig)
    print(f"Quantized model saved to {quantized_dir}")

    # Report sizes
    onnx_files = list(quantized_dir.glob("*.onnx"))
    quantized_size = sum(os.path.getsize(f) for f in onnx_files)
    print(f"\nQuantized ONNX size: {quantized_size / 1e6:.1f} MB")
    print(f"\nTo deploy: copy contents of {quantized_dir} to extension/public/claim_model/")
    print("Export complete!")


if __name__ == "__main__":
    main()
