#!/usr/bin/env python3
"""Generate a simple PNG icon without external image dependencies."""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path


SIZE = 512
OUT = Path(__file__).resolve().parents[1] / "src-tauri" / "icons" / "icon.png"


def rgba(hex_color: str) -> tuple[int, int, int, int]:
    value = hex_color.lstrip("#")
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16), 255


BG = rgba("#f6f5f2")
SURFACE = rgba("#ffffff")
BORDER = rgba("#dedbd2")
ACCENT = rgba("#4466d4")
GREEN = rgba("#3a9a6f")
WHITE = rgba("#ffffff")


def in_rounded_rect(x: int, y: int, left: int, top: int, right: int, bottom: int, radius: int) -> bool:
    if x < left or x >= right or y < top or y >= bottom:
        return False
    cx = min(max(x, left + radius), right - radius - 1)
    cy = min(max(y, top + radius), bottom - radius - 1)
    return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= radius * radius


def dist_to_segment(px: int, py: int, ax: int, ay: int, bx: int, by: int) -> float:
    vx = bx - ax
    vy = by - ay
    wx = px - ax
    wy = py - ay
    length_sq = vx * vx + vy * vy
    if length_sq == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, (wx * vx + wy * vy) / length_sq))
    cx = ax + t * vx
    cy = ay + t * vy
    return math.hypot(px - cx, py - cy)


def pixel(x: int, y: int) -> tuple[int, int, int, int]:
    if not in_rounded_rect(x, y, 0, 0, SIZE, SIZE, 96):
        return 0, 0, 0, 0
    color = BG
    if in_rounded_rect(x, y, 72, 78, 440, 434, 52):
        color = BORDER
    if in_rounded_rect(x, y, 90, 96, 422, 416, 38):
        color = SURFACE
    for ay, bx in [(176, 364), (248, 364), (320, 280)]:
        if dist_to_segment(x, y, 148, ay, bx, ay) <= 17:
            color = ACCENT
    if (x - 354) * (x - 354) + (y - 330) * (y - 330) <= 48 * 48:
        color = GREEN
    if dist_to_segment(x, y, 334, 330, 374, 330) <= 9 or dist_to_segment(x, y, 354, 310, 354, 350) <= 9:
        color = WHITE
    return color


def png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + chunk_type + data + struct.pack(">I", zlib.crc32(chunk_type + data) & 0xFFFFFFFF)


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    raw = bytearray()
    for y in range(SIZE):
        raw.append(0)
        for x in range(SIZE):
            raw.extend(pixel(x, y))
    png = bytearray(b"\x89PNG\r\n\x1a\n")
    png.extend(png_chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0)))
    png.extend(png_chunk(b"IDAT", zlib.compress(bytes(raw), 9)))
    png.extend(png_chunk(b"IEND", b""))
    OUT.write_bytes(png)


if __name__ == "__main__":
    main()
