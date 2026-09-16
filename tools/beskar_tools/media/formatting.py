"""Formatting helpers shared by media-processing commands."""

from __future__ import annotations


def human_size(value: float) -> str:
    """Return a compact IEC-style size label."""

    for unit in ("B", "KB", "MB", "GB"):
        if value < 1024:
            return f"{value:.1f} {unit}"
        value /= 1024
    return f"{value:.1f} TB"
