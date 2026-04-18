"""Thin ffmpeg/ffprobe wrappers.

We shell out to ffmpeg because there is no good pure-Python alternative for
lossless splitting. Subprocess is used with a fixed argv list (no shell=True),
which keeps injection risk zero as long as callers pass Path objects rather
than raw user strings.
"""

from __future__ import annotations

import json
import logging
import shutil
import subprocess
from pathlib import Path

log = logging.getLogger(__name__)


class AudioToolError(RuntimeError):
    """Raised when ffmpeg or ffprobe is missing or fails."""


def _require(tool: str) -> str:
    path = shutil.which(tool)
    if not path:
        raise AudioToolError(
            f"{tool} is required but not found on PATH. Install it (e.g., brew install ffmpeg)."
        )
    return path


def probe_duration_seconds(path: Path) -> float:
    """Return audio duration in seconds via ffprobe."""

    ffprobe = _require("ffprobe")
    result = subprocess.run(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(result.stdout or "{}")
    duration = payload.get("format", {}).get("duration")
    if duration is None:
        raise AudioToolError(f"ffprobe returned no duration for {path}")
    return float(duration)


def split_by_length(
    source: Path,
    target_dir: Path,
    *,
    segment_seconds: int,
    stem: str,
    audio_format: str = "mp3",
) -> list[Path]:
    """Split `source` into consecutive chunks of `segment_seconds` inside `target_dir`.

    Returns the list of created files in track order (001..NNN).
    """

    ffmpeg = _require("ffmpeg")
    target_dir.mkdir(parents=True, exist_ok=True)
    pattern = target_dir / f"{stem} - %03d.{audio_format}"

    subprocess.run(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(source),
            "-f",
            "segment",
            "-segment_time",
            str(segment_seconds),
            "-c",
            "copy",
            "-reset_timestamps",
            "1",
            str(pattern),
        ],
        check=True,
    )

    return sorted(target_dir.glob(f"{stem} - *.{audio_format}"))


def convert_image(source: Path, target: Path) -> Path:
    """Convert any image (webp, png, etc.) to jpg via ffmpeg for ABS cover.jpg."""

    ffmpeg = _require("ffmpeg")
    target.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(source),
            str(target),
        ],
        check=True,
    )
    return target
