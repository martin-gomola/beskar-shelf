"""Typed data models shared across fetch/normalize/resolve/organize stages."""

from __future__ import annotations

from enum import StrEnum
from pathlib import Path

from pydantic import BaseModel, Field


class Confidence(StrEnum):
    """How much we trust the parsed author/title pair."""

    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class Source(StrEnum):
    YT_TITLE = "yt-title"
    YT_UPLOADER = "yt-uploader"
    RULE = "rule"
    OPENLIBRARY = "openlibrary"
    WIKIDATA = "wikidata"
    USER = "user"


class BookRef(BaseModel):
    """Normalized reference for one audiobook."""

    author: str
    title: str
    series: str | None = None
    series_index: int | None = None
    confidence: Confidence = Confidence.MEDIUM
    sources: list[Source] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)

    def with_(self, **changes: object) -> BookRef:
        return self.model_copy(update=changes)


class VideoMetadata(BaseModel):
    """Subset of yt-dlp metadata we actually use."""

    video_id: str
    url: str
    title: str
    uploader: str | None = None
    channel: str | None = None
    duration_seconds: float | None = None
    description: str | None = None
    thumbnail_url: str | None = None


class MergePlan(BaseModel):
    """Describes how a newly-downloaded book slots next to an existing ABS entry."""

    target_author_dir: Path
    target_book_dir: Path
    track_offset: int = 0  # renumber new tracks starting at existing_count + 1
    existing_track_count: int = 0
    reason: str = ""
    drop_files: list[Path] = Field(default_factory=list)  # duplicates to discard (covers, etc.)


class ResolveResult(BaseModel):
    """Output of a knowledge-base lookup."""

    book: BookRef | None
    source: Source
    raw: dict | None = None
