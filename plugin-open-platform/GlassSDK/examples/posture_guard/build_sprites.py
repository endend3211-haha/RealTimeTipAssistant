#!/usr/bin/env python3
"""Build display-calibrated GRAY4 RLE posture guard sprite."""

import argparse
from pathlib import Path
from typing import List
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "assets" / "turtle-pose.png"
OUTPUT = ROOT / "turtle_sprites.h"
FRAME_WIDTH = 128
FRAME_HEIGHT = 128
ALPHA_CUTOFF = 24

def quantize(frame: Image.Image) -> List[int]:
    alpha = frame.getchannel("A")
    gray = ImageOps.grayscale(frame)
    gray = ImageEnhance.Contrast(gray).enhance(1.08)
    gray = gray.filter(ImageFilter.UnsharpMask(radius=1, percent=110, threshold=3))
    alpha_pixels = alpha.load()
    gray_pixels = gray.load()
    values = [0] * (FRAME_WIDTH * FRAME_HEIGHT)
    for y in range(FRAME_HEIGHT):
        for x in range(FRAME_WIDTH):
            opacity = alpha_pixels[x, y]
            if opacity < ALPHA_CUTOFF:
                continue
            luminance = gray_pixels[x, y] * opacity // 255
            level = (luminance * 15 + 127) // 255
            values[y * FRAME_WIDTH + x] = max(1, level)
    return values

def encode(values: List[int]) -> bytes:
    output = bytearray()
    start = 0
    while start < len(values):
        value = values[start]
        count = 1
        while (
            start + count < len(values)
            and values[start + count] == value
            and count < 255
        ):
            count += 1
        output.extend((count, value))
        start += count
    return bytes(output)

def main() -> None:
    img = Image.open(SOURCE).convert("RGBA")
    img = img.resize((FRAME_WIDTH, FRAME_HEIGHT), Image.Resampling.LANCZOS)
    values = quantize(img)
    data = encode(values)

    lines = [
        "#ifndef TURTLE_SPRITES_H",
        "#define TURTLE_SPRITES_H",
        "",
        f"#define TURTLE_SPRITE_WIDTH {FRAME_WIDTH}U",
        f"#define TURTLE_SPRITE_HEIGHT {FRAME_HEIGHT}U",
        "",
        "static const uint8_t turtle_sprite_data[] = {"
    ]
    for offset in range(0, len(data), 20):
        chunk = ", ".join(f"0x{value:02X}" for value in data[offset : offset + 20])
        lines.append(f"    {chunk},")
    lines.extend([
        "};",
        f"static const uint32_t turtle_sprite_size = sizeof(turtle_sprite_data);",
        "",
        "#endif"
    ])
    OUTPUT.write_text("\n".join(lines) + "\n", encoding="ascii")
    print(f"wrote {OUTPUT}: {len(data)} RLE bytes")

if __name__ == "__main__":
    main()