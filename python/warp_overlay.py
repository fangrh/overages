#!/usr/bin/env python3
"""Warp a microscopy raster into a GDS coordinate-aligned PNG.

Input is JSON on stdin:
{
  "imagePath": "...",
  "outputPath": "...",
  "matrix": [a,b,c,d,e,f],
  "boundsUm": [minX,minY,maxX,maxY],
  "outputSizePx": [width,height]
}

The matrix maps image pixels to GDS um:
  gdsX = a*x + b*y + c
  gdsY = d*x + e*y + f
"""

from __future__ import annotations

import json
import math
import os
import sys
from typing import Iterable

try:
    from PIL import Image
except Exception as exc:  # pragma: no cover - exercised only on missing deps
    print(f"Missing Python image dependency Pillow: {exc}", file=sys.stderr)
    sys.exit(2)


def _numbers(values: Iterable[object], expected: int, name: str) -> list[float]:
    out = [float(v) for v in values]
    if len(out) != expected or any(not math.isfinite(v) for v in out):
        raise ValueError(f"{name} must contain {expected} finite numbers")
    return out


def _invert_affine(matrix: list[float]) -> list[float]:
    a, b, c, d, e, f = matrix
    det = a * e - b * d
    if abs(det) < 1e-12:
        raise ValueError("transform matrix is not invertible")
    return [
        e / det,
        -b / det,
        (b * f - e * c) / det,
        -d / det,
        a / det,
        (d * c - a * f) / det,
    ]


def _warp(request: dict) -> dict:
    image_path = str(request.get("imagePath") or "")
    output_path = str(request.get("outputPath") or "")
    if not image_path or not output_path:
        raise ValueError("imagePath and outputPath are required")

    matrix = _numbers(request.get("matrix") or [], 6, "matrix")
    bounds = _numbers(request.get("boundsUm") or [], 4, "boundsUm")
    output_size = [int(v) for v in request.get("outputSizePx") or []]
    if len(output_size) != 2 or output_size[0] <= 0 or output_size[1] <= 0:
        raise ValueError("outputSizePx must contain positive width and height")

    min_x, min_y, max_x, max_y = bounds
    out_w, out_h = output_size
    scale_x = (max_x - min_x) / out_w
    scale_y = (max_y - min_y) / out_h
    inv = _invert_affine(matrix)

    # Pillow's affine transform maps output pixels back into source pixels.
    # Compose: output pixel -> GDS um bounds -> source image pixel.
    coeffs = (
        inv[0] * scale_x,
        inv[1] * scale_y,
        inv[0] * min_x + inv[1] * min_y + inv[2],
        inv[3] * scale_x,
        inv[4] * scale_y,
        inv[3] * min_x + inv[4] * min_y + inv[5],
    )

    image = Image.open(image_path).convert("RGBA")
    warped = image.transform(
        (out_w, out_h),
        Image.Transform.AFFINE,
        coeffs,
        resample=Image.Resampling.BILINEAR,
        fillcolor=(0, 0, 0, 0),
    )

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    warped.save(output_path, format="PNG")
    return {
        "outputPath": output_path,
        "sizePx": [out_w, out_h],
        "boundsUm": bounds,
    }


def main() -> int:
    try:
        request = json.load(sys.stdin)
        response = _warp(request)
        print(json.dumps(response))
        return 0
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
