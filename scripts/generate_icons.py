#!/usr/bin/env python3
"""Render the shared LocalSpend SVG into the committed app icon sizes."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "localspend-icon.svg"
TARGETS = {
    ROOT / "public" / "apple-touch-icon.png": 180,
    ROOT / "public" / "localspend-icon-192.png": 192,
    ROOT / "public" / "localspend-icon-512.png": 512,
}


def main() -> None:
    converter = shutil.which("rsvg-convert")
    if converter is None:
        raise SystemExit("rsvg-convert is required. Install librsvg, then run this script again.")

    for output, size in TARGETS.items():
        output.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            [converter, "--width", str(size), "--height", str(size), "--output", str(output), str(SOURCE)],
            check=True,
        )

    npm = shutil.which("npm")
    if npm is None:
        raise SystemExit("npm is required to generate the Tauri platform icon set.")
    subprocess.run([npm, "run", "tauri", "--", "icon", str(SOURCE)], cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
