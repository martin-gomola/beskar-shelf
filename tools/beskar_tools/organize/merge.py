"""Detect when a new download is actually a continuation of an existing book.

We had this exact situation with Jeffrey Archer's "Jen čas ukáže" — part 1
was already on the server, the download was part 2. Instead of producing a
duplicate `Author/Title/` folder, the planner compares the normalized title
against the existing ABS library (if available) and against the existing
filesystem tree and reports a MergePlan that the layout writer can honor.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from pathlib import Path

from rapidfuzz import fuzz

from ..abs_client import ABSClient
from ..models import BookRef, MergePlan

log = logging.getLogger(__name__)

_PART_IN_NAME = re.compile(
    r"\b(?:část|cast|časť|díl|dil|part)\s*\d+\b",
    re.IGNORECASE,
)


def _strip_part(name: str) -> str:
    return _PART_IN_NAME.sub("", name).strip(" -–—")


def _fuzzy_equal(a: str, b: str, threshold: int = 85) -> bool:
    return fuzz.token_sort_ratio(a, b) >= threshold


@dataclass
class LibraryEntry:
    author: str
    title: str
    folder: Path | None = None

    @property
    def stem_title(self) -> str:
        return _strip_part(self.title)


class MergePlanner:
    """Finds existing ABS entries a new download should merge into."""

    def __init__(
        self,
        *,
        download_root: Path,
        abs_client: ABSClient | None = None,
        abs_library_id: str | None = None,
        abs_audiobook_root: Path | None = None,
    ) -> None:
        self._download_root = download_root
        self._abs_client = abs_client
        self._abs_library_id = abs_library_id
        self._abs_root = abs_audiobook_root

    def plan(self, book: BookRef, part_number: int | None) -> MergePlan | None:
        """Return a MergePlan if the book should merge into an existing entry."""

        if part_number is None and not _PART_IN_NAME.search(book.title):
            return None

        match = self._find_existing(book)
        if match is None:
            return None

        target_author_dir = match.folder.parent if match.folder else self._download_root / book.author
        target_book_dir = match.folder or target_author_dir / match.title

        existing_count = 0
        if target_book_dir.exists():
            existing_count = sum(
                1
                for child in target_book_dir.iterdir()
                if child.is_file() and child.suffix.lower() in {".mp3", ".m4a", ".m4b", ".opus"}
            )

        return MergePlan(
            target_author_dir=target_author_dir,
            target_book_dir=target_book_dir,
            track_offset=existing_count,
            existing_track_count=existing_count,
            reason=f"matched existing book '{match.title}' (part {part_number or '?'})",
        )

    def _find_existing(self, book: BookRef) -> LibraryEntry | None:
        stem = _strip_part(book.title)

        # Prefer ABS library data when we have it.
        if self._abs_client and self._abs_library_id:
            try:
                items = self._abs_client.library_items(self._abs_library_id)
            except Exception as exc:
                log.warning("ABS library listing failed: %s", exc)
                items = []
            for item in items:
                metadata = (item.get("media") or {}).get("metadata") or {}
                abs_author = (metadata.get("authorName") or metadata.get("author") or "").strip()
                abs_title = (metadata.get("title") or "").strip()
                if not abs_title:
                    continue
                if not _fuzzy_equal(abs_author, book.author):
                    continue
                if _fuzzy_equal(_strip_part(abs_title), stem):
                    return LibraryEntry(author=abs_author, title=abs_title)

        # Otherwise walk the ABS audiobooks root on disk if it is mounted.
        if self._abs_root and self._abs_root.exists():
            author_dir = self._abs_root / book.author
            if author_dir.exists():
                for child in author_dir.iterdir():
                    if not child.is_dir():
                        continue
                    if _fuzzy_equal(_strip_part(child.name), stem):
                        return LibraryEntry(
                            author=book.author, title=child.name, folder=child
                        )

        return None
