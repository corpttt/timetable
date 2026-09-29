#!/usr/bin/env python3
"""Иконка расписания: чёрный фон + цветные полоски."""

from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw

BG = (1, 4, 9, 255)
STRIPES = [
    (88, 166, 255, 255),   # blue
    (255, 166, 87, 255),   # orange
    (163, 113, 247, 255),  # purple
    (63, 185, 80, 255),    # green
]


def create_icon(size: int, output_path: str | Path) -> None:
    img = Image.new("RGBA", (size, size), BG)
    draw = ImageDraw.Draw(img)

    # Safe zone ~18% for maskable / Android adaptive icons
    pad_x = int(size * 0.18)
    pad_y = int(size * 0.22)
    n = len(STRIPES)
    gap = int(size * 0.045)
    usable = size - 2 * pad_y - gap * (n - 1)
    h = max(1, usable // n)
    # center leftover vertically
    leftover = size - 2 * pad_y - n * h - (n - 1) * gap
    y = pad_y + leftover // 2
    radius = max(2, h // 2)

    for color in STRIPES:
        draw.rounded_rectangle(
            [(pad_x, y), (size - pad_x, y + h)],
            radius=radius,
            fill=color,
        )
        y += h + gap

    img.save(output_path, "PNG")
    print(f"Created {output_path} ({size}x{size})")


def create_favicon(icons_dir: Path, out: Path) -> None:
    src = icons_dir / "icon-192.png"
    im = Image.open(src).convert("RGBA").resize((32, 32), Image.Resampling.LANCZOS)
    im.save(out, format="ICO", sizes=[(32, 32)])
    print(f"Created {out}")


if __name__ == "__main__":
    script_dir = Path(__file__).resolve().parent
    icons_dir = script_dir / "icons"
    icons_dir.mkdir(exist_ok=True)
    create_icon(192, icons_dir / "icon-192.png")
    create_icon(512, icons_dir / "icon-512.png")
    create_favicon(icons_dir, script_dir / "favicon.ico")
    print("OK")
