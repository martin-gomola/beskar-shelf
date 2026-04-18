"""Heuristic parser: raw YouTube metadata -> BookRef candidates.

The parser never guesses. It emits the best (author, title) pair it can
justify plus a confidence level. Low-confidence pairs are expected to be
either corrected by a resolver (Open Library / Wikidata / ABS lookup) or
routed to the review queue by the orchestrator.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from ..models import BookRef, Confidence, Source, VideoMetadata
from . import patterns
from .rules import apply_rules


@dataclass
class ParseOutcome:
    book: BookRef
    part_number: int | None
    raw_title: str
    raw_uploader: str | None


def _strip_noise(text: str) -> str:
    out = text
    for pat in patterns.NOISE_TOKENS:
        out = pat.sub("", out)
    out = patterns.TRAILING_BRACKETS.sub("", out)
    out = patterns.NARRATOR.sub("", out)
    return re.sub(r"\s+", " ", out).strip(" -–—:|,")


def _extract_part(text: str) -> tuple[str, int | None]:
    match = patterns.PART_INDICATOR.search(text)
    if not match:
        return text, None
    part = int(match.group("n"))
    cleaned = patterns.PART_INDICATOR.sub("", text).strip(" -–—:|,")
    return cleaned, part


def _split_author_title(text: str) -> tuple[str, str] | None:
    for sep in patterns.AUTHOR_TITLE_SEPARATORS:
        if sep in text:
            left, right = text.split(sep, 1)
            left, right = left.strip(), right.strip()
            if left and right:
                return left, right
    return None


def _looks_like_author(candidate: str) -> bool:
    """Heuristic: two or three capitalized tokens, no digits, no lowercase-only tokens."""

    tokens = candidate.split()
    if not 1 <= len(tokens) <= 4:
        return False
    if any(ch.isdigit() for ch in candidate):
        return False
    capitalized = sum(1 for t in tokens if t[:1].isupper())
    return capitalized >= max(1, len(tokens) - 1)


def _pair_from_split(left: str, right: str) -> tuple[str, str, Confidence]:
    """Decide which side is the author and which is the title.

    When both sides could be either, the longer side is the title. When the
    left side looks like an author (short, capitalized) we trust the order;
    otherwise we swap.
    """

    if _looks_like_author(left) and not _looks_like_author(right):
        return left, right, Confidence.HIGH
    if _looks_like_author(right) and not _looks_like_author(left):
        return right, left, Confidence.HIGH
    if len(left) <= len(right):
        return left, right, Confidence.MEDIUM
    return right, left, Confidence.MEDIUM


def _apply_overrides(raw_title: str, uploader: str | None) -> tuple[str, str] | None:
    if not uploader:
        return None
    overrides = patterns.UPLOADER_OVERRIDES.get(uploader)
    if not overrides:
        return None
    lowered = raw_title.lower()
    for needle, (author, title) in overrides.items():
        if needle in lowered:
            return author, title
    return None


def parse(meta: VideoMetadata) -> ParseOutcome:
    """Parse a VideoMetadata into a BookRef with confidence + provenance."""

    raw_title = meta.title
    uploader = meta.uploader

    # Step 1: manual overrides we already know about.
    override = _apply_overrides(raw_title, uploader)
    if override:
        author, title = override
        return ParseOutcome(
            book=BookRef(
                author=author,
                title=title,
                confidence=Confidence.HIGH,
                sources=[Source.RULE],
                notes=["uploader override"],
            ),
            part_number=None,
            raw_title=raw_title,
            raw_uploader=uploader,
        )

    # Step 2: strip generic noise first, then apply data-driven cleanup.
    # The order matters: _strip_noise understands compound tokens like
    # "Full Audiobook" as a single unit, while the rules only match
    # individual trailing keywords.
    cleaned = _strip_noise(raw_title)
    cleaned = apply_rules(cleaned, uploader)
    cleaned, part = _extract_part(cleaned)

    # Step 3: split on author/title separator if one exists.
    split = _split_author_title(cleaned)
    channel_is_publisher = (
        uploader is not None
        and uploader in patterns.CHANNEL_ATTRIBUTION
        and patterns.CHANNEL_ATTRIBUTION[uploader] is None
    )

    if split:
        # Noise tokens can sit on either side of the separator
        # (e.g. "Author – Title – Full Audiobook"). Strip each half again.
        left, right = split
        left = _strip_noise(left)
        right = _strip_noise(right)
        author, title, confidence = _pair_from_split(left, right)
        sources = [Source.YT_TITLE]
        notes: list[str] = []
    else:
        mapped = patterns.CHANNEL_ATTRIBUTION.get(uploader or "")
        if mapped:
            author = mapped
            title = cleaned
            confidence = Confidence.MEDIUM
            sources = [Source.YT_TITLE, Source.YT_UPLOADER]
            notes = [f"channel '{uploader}' mapped to author"]
        elif channel_is_publisher:
            # Explicit "do not use this channel as author" marker — keep the
            # placeholder author but mark low-confidence so the orchestrator
            # routes this to the review queue for human confirmation.
            author = "Unknown"
            title = cleaned or raw_title
            confidence = Confidence.LOW
            sources = [Source.YT_TITLE]
            notes = [f"channel '{uploader}' is a known publisher, not an author"]
        elif uploader and _looks_like_author(uploader):
            author = uploader
            title = cleaned
            confidence = Confidence.LOW
            sources = [Source.YT_UPLOADER, Source.YT_TITLE]
            notes = ["uploader used as author (no separator in title)"]
        else:
            author = uploader or "Unknown"
            title = cleaned or raw_title
            confidence = Confidence.LOW
            sources = [Source.YT_TITLE]
            notes = ["could not split author from title"]

    return ParseOutcome(
        book=BookRef(
            author=author,
            title=title,
            confidence=confidence,
            sources=sources,
            notes=notes,
        ),
        part_number=part,
        raw_title=raw_title,
        raw_uploader=uploader,
    )
