"""ID3 tagging via mutagen.

Writing embedded metadata means ABS (and any player) picks up author/title/
track# even if folder names are off. It also gives us embedded cover art per
track, which helps on mobile players that do not inherit folder covers.
"""

from __future__ import annotations

import logging
from pathlib import Path

from mutagen.id3 import APIC, ID3, TALB, TIT2, TPE1, TPOS, TRCK, ID3NoHeaderError
from mutagen.mp3 import MP3

from .models import BookRef

log = logging.getLogger(__name__)


def write_track_tags(
    path: Path,
    book: BookRef,
    *,
    track_number: int,
    total_tracks: int,
    cover_jpg: Path | None = None,
    disc_number: int | None = None,
) -> None:
    """Apply ID3v2.4 tags to a single mp3."""

    if path.suffix.lower() != ".mp3":
        log.debug("skip tagging for non-mp3 %s", path)
        return

    try:
        audio = MP3(path, ID3=ID3)
    except ID3NoHeaderError:
        audio = MP3(path)
        audio.add_tags()

    tags = audio.tags
    if tags is None:
        audio.add_tags()
        tags = audio.tags

    tags.setall("TPE1", [TPE1(encoding=3, text=book.author)])
    tags.setall("TALB", [TALB(encoding=3, text=book.title)])
    tags.setall("TIT2", [TIT2(encoding=3, text=f"{track_number:03d} - {book.title}")])
    tags.setall("TRCK", [TRCK(encoding=3, text=f"{track_number}/{total_tracks}")])
    if disc_number is not None:
        tags.setall("TPOS", [TPOS(encoding=3, text=str(disc_number))])

    if cover_jpg and cover_jpg.exists():
        with cover_jpg.open("rb") as fh:
            cover_bytes = fh.read()
        tags.delall("APIC")
        tags.add(
            APIC(
                encoding=3,
                mime="image/jpeg",
                type=3,  # front cover
                desc="Cover",
                data=cover_bytes,
            )
        )

    audio.save()
