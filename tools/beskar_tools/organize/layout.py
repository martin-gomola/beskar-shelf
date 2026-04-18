"""Write an ABS-compatible Author/Title/tracks layout."""

from __future__ import annotations

import logging
import re
import shutil
from dataclasses import dataclass
from pathlib import Path

from ..models import BookRef

log = logging.getLogger(__name__)

_FS_SAFE = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def safe_fs_name(name: str) -> str:
    """Produce a filesystem-safe name.

    Strips chars that are illegal on Windows + macOS hidden-file markers, and
    collapses redundant whitespace. We preserve diacritics; the rest of the
    pipeline is UTF-8 clean.
    """

    cleaned = _FS_SAFE.sub(" ", name)
    cleaned = cleaned.replace("  ", " ").strip(" .")
    # Disallow leading dot (hidden files on unix / macOS invisibility).
    return cleaned.lstrip(".") or "Untitled"


@dataclass
class LayoutResult:
    author_dir: Path
    book_dir: Path
    track_paths: list[Path]
    cover_path: Path | None


def write_book_layout(
    root: Path,
    book: BookRef,
    track_sources: list[Path],
    *,
    cover_source: Path | None = None,
    track_offset: int = 0,
    move: bool = True,
) -> LayoutResult:
    """Move/copy track files into `root/Author/Title/NNN - Title.ext`.

    `track_offset` lets the merge planner renumber new tracks so they append
    cleanly to an existing multi-part book.
    """

    author_dir = root / safe_fs_name(book.author)
    book_dir = author_dir / safe_fs_name(book.title)
    book_dir.mkdir(parents=True, exist_ok=True)

    written: list[Path] = []
    for index, source in enumerate(sorted(track_sources), start=1):
        track_number = index + track_offset
        suffix = source.suffix.lower()
        target_name = f"{track_number:03d} - {safe_fs_name(book.title)}{suffix}"
        target = book_dir / target_name
        if move:
            shutil.move(str(source), target)
        else:
            shutil.copy2(source, target)
        written.append(target)

    cover_target: Path | None = None
    if cover_source and cover_source.exists():
        cover_target = book_dir / f"cover{cover_source.suffix.lower()}"
        if move:
            shutil.move(str(cover_source), cover_target)
        else:
            shutil.copy2(cover_source, cover_target)

    return LayoutResult(
        author_dir=author_dir,
        book_dir=book_dir,
        track_paths=written,
        cover_path=cover_target,
    )
