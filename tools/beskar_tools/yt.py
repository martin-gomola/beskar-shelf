"""yt-dlp wrapper.

We call yt-dlp as a Python library (not subprocess) so we get structured
metadata dictionaries back instead of having to parse --print templates.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from yt_dlp import YoutubeDL

from .models import VideoMetadata

log = logging.getLogger(__name__)


class YtError(RuntimeError):
    """Raised when yt-dlp cannot fetch a URL."""


def fetch_metadata(url: str, *, cookies: str | None = None) -> VideoMetadata:
    """Fetch video metadata without downloading the stream."""

    opts: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
    }
    if cookies:
        opts["cookiefile"] = cookies

    try:
        with YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as exc:
        raise YtError(f"yt-dlp failed for {url}: {exc}") from exc

    if not info:
        raise YtError(f"yt-dlp returned no metadata for {url}")

    return VideoMetadata(
        video_id=info.get("id") or "",
        url=info.get("webpage_url") or url,
        title=info.get("title") or "",
        uploader=info.get("uploader") or info.get("channel"),
        channel=info.get("channel"),
        duration_seconds=info.get("duration"),
        description=info.get("description"),
        thumbnail_url=info.get("thumbnail"),
    )


def download_audio(
    url: str,
    output_dir: Path,
    *,
    audio_format: str = "mp3",
    audio_quality: str = "0",
    cookies: str | None = None,
    progress_hook: callable | None = None,
) -> Path:
    """Download audio stream into `output_dir/<title>.<ext>` and return the final path."""

    output_dir.mkdir(parents=True, exist_ok=True)

    opts: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "format": "bestaudio/best",
        "outtmpl": str(output_dir / "%(title)s.%(ext)s"),
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": audio_format,
                "preferredquality": audio_quality,
            },
        ],
        "writethumbnail": True,
        "postprocessor_args": ["-loglevel", "error"],
    }
    if cookies:
        opts["cookiefile"] = cookies
    if progress_hook is not None:
        opts["progress_hooks"] = [progress_hook]

    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)

    if not info:
        raise YtError(f"yt-dlp completed without info for {url}")

    # After post-processing the extension is audio_format; yt-dlp rewrites `filepath`.
    filepath = info.get("requested_downloads", [{}])[-1].get("filepath") or info.get("filepath")
    if not filepath:
        # Fallback: recompute from title
        candidate = output_dir / f"{info['title']}.{audio_format}"
        if candidate.exists():
            return candidate
        raise YtError(f"yt-dlp did not report a filepath for {url}")

    return Path(filepath)
