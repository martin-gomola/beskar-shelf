"""Multi-part book merge detection."""

from __future__ import annotations

from pathlib import Path

from beskar_tools.models import BookRef, Confidence
from beskar_tools.organize.merge import MergePlanner


def test_matching_book_on_disk_triggers_merge_with_correct_offset(tmp_path: Path) -> None:
    abs_root = tmp_path / "abs"
    existing = abs_root / "Jeffrey Archer" / "Jen čas ukáže - Část 1"
    existing.mkdir(parents=True)
    # 17 tracks already in place.
    for i in range(1, 18):
        (existing / f"{i:03d} - Jen čas ukáže.mp3").touch()

    planner = MergePlanner(
        download_root=tmp_path / "downloads",
        abs_audiobook_root=abs_root,
    )

    plan = planner.plan(
        BookRef(author="Jeffrey Archer", title="Jen čas ukáže - Část 2", confidence=Confidence.HIGH),
        part_number=2,
    )

    assert plan is not None, "should detect the existing part 1"
    assert plan.track_offset == 17
    assert plan.target_book_dir == existing


def test_single_part_book_does_not_merge(tmp_path: Path) -> None:
    planner = MergePlanner(download_root=tmp_path / "downloads")
    plan = planner.plan(
        BookRef(author="Anyone", title="Standalone novel", confidence=Confidence.HIGH),
        part_number=None,
    )
    assert plan is None
