"""Environment + configuration loading for beskar tools.

The repo already uses two .env files: one at repo root and one under tools/grab/.
This module merges them (repo-level wins for shared keys) and exposes a typed
BeskarConfig so downstream code never touches raw os.environ.
"""

from __future__ import annotations

from pathlib import Path

from dotenv import dotenv_values
from pydantic import BaseModel, Field

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
TOOLS_ROOT = REPO_ROOT / "tools"
GRAB_DIR = TOOLS_ROOT / "grab"


class BeskarConfig(BaseModel):
    """Runtime configuration assembled from .env files and overrides."""

    abs_url: str | None = Field(default=None, description="Public Audiobookshelf URL")
    abs_local_url: str | None = Field(
        default=None, description="LAN-side Audiobookshelf URL used for API calls"
    )
    abs_token: str | None = None
    abs_library_id: str | None = None
    abs_username: str | None = None

    output_dir: Path = Field(
        default_factory=lambda: REPO_ROOT / "downloads",
        description="Where grab writes downloads before ABS import",
    )
    links_file: Path = Field(
        default_factory=lambda: REPO_ROOT / "book-yt-links.txt",
        description="Newline-separated list of YouTube URLs to process",
    )
    review_dir: Path = Field(
        default_factory=lambda: REPO_ROOT / "downloads" / "_review",
        description="Low-confidence downloads land here instead of the main tree",
    )
    cache_dir: Path = Field(
        default_factory=lambda: TOOLS_ROOT / ".cache",
        description="SQLite cache for resolver lookups",
    )

    split_hours: float = Field(default=2.0, ge=0.0, description="Chunk length for long files")
    min_split_hours: float = Field(
        default=3.0, ge=0.0, description="Files shorter than this are kept whole"
    )
    audio_format: str = Field(default="mp3")
    audio_quality: str = Field(default="0")

    @property
    def effective_abs_url(self) -> str | None:
        """Prefer the LAN URL for API calls so we don't go through WAN/HTTPS."""
        return self.abs_local_url or self.abs_url

    def have_abs_api(self) -> bool:
        return bool(self.effective_abs_url and self.abs_token)


def _coerce_path(value: str | None, fallback: Path) -> Path:
    return Path(value).expanduser() if value else fallback


def load_config(overrides: dict[str, str] | None = None) -> BeskarConfig:
    """Load .env files from repo root + tools/grab/, apply overrides, return typed config."""

    merged: dict[str, str] = {}
    for env_path in (REPO_ROOT / ".env", GRAB_DIR / ".env"):
        if env_path.exists():
            merged.update({k: v for k, v in dotenv_values(env_path).items() if v is not None})
    if overrides:
        merged.update(overrides)

    defaults = BeskarConfig()
    return BeskarConfig(
        abs_url=merged.get("ABS_URL") or None,
        abs_local_url=merged.get("ABS_LOCAL_URL") or None,
        abs_token=merged.get("ABS_TOKEN") or None,
        abs_library_id=merged.get("ABS_LIBRARY_ID") or None,
        abs_username=merged.get("ABS_USERNAME") or None,
        output_dir=_coerce_path(merged.get("OUTPUT_DIR"), defaults.output_dir),
        links_file=_coerce_path(merged.get("LINKS_FILE"), defaults.links_file),
        review_dir=_coerce_path(merged.get("REVIEW_DIR"), defaults.review_dir),
        cache_dir=_coerce_path(merged.get("CACHE_DIR"), defaults.cache_dir),
        split_hours=float(merged.get("SPLIT_HOURS", defaults.split_hours)),
        min_split_hours=float(merged.get("MIN_SPLIT_HOURS", defaults.min_split_hours)),
        audio_format=merged.get("AUDIO_FORMAT") or defaults.audio_format,
        audio_quality=merged.get("AUDIO_QUALITY") or defaults.audio_quality,
    )
