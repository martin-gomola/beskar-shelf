"""Parser tests, seeded with every failure mode we have hit in production.

Each test name references the raw YouTube title + uploader so regressions
stay readable. When a new failure pattern appears, add a case here first.
"""

from __future__ import annotations

import pytest

from beskar_tools.models import Confidence, VideoMetadata
from beskar_tools.normalize import parse


def _meta(title: str, uploader: str | None = None, video_id: str = "abc") -> VideoMetadata:
    return VideoMetadata(video_id=video_id, url=f"https://youtu.be/{video_id}", title=title, uploader=uploader)


def test_classic_author_dash_title_is_high_confidence():
    outcome = parse(_meta("Jeffrey Archer - Jen čas ukáže", uploader="Some Channel"))
    assert outcome.book.author == "Jeffrey Archer"
    assert outcome.book.title == "Jen čas ukáže"
    assert outcome.book.confidence == Confidence.HIGH


def test_title_dash_author_gets_swapped():
    # Title first, author second — parser should detect that the right side
    # is the short all-capitalized token and swap.
    outcome = parse(_meta("Mississippské poviedky – John Grisham"))
    assert outcome.book.author == "John Grisham"
    assert outcome.book.title == "Mississippské poviedky"


def test_mluvene_slovo_uses_manual_override_for_christie():
    outcome = parse(
        _meta("Experiment profesora Wynthorpa - celá audiokniha", uploader="Mluvené Slovo")
    )
    assert outcome.book.author == "Agatha Christie"
    assert outcome.book.title == "Experiment profesora Wynthorpa"


def test_mluvene_slovo_without_override_refuses_to_use_channel_as_author():
    # For an unknown Mluvené Slovo upload we should NOT attribute to "Mluvené
    # Slovo"; the parser falls back to low confidence which the orchestrator
    # will route to the review queue.
    outcome = parse(_meta("Nějaká neznámá audiokniha", uploader="Mluvené Slovo"))
    assert outcome.book.confidence == Confidence.LOW


def test_audio_literatura_channel_not_used_as_author():
    outcome = parse(_meta("Neznámá audiokniha", uploader="Audio-Literatúra"))
    assert outcome.book.confidence == Confidence.LOW
    assert outcome.book.author != "Audio-Literatúra"


def test_part_number_extracted_and_stripped_from_title():
    outcome = parse(_meta("Jeffrey Archer - Jen čas ukáže - Část 2"))
    assert outcome.part_number == 2
    assert "Část" not in outcome.book.title
    assert outcome.book.title == "Jen čas ukáže"


def test_trailing_language_tag_removed():
    outcome = parse(_meta("Jeffrey Archer - Jen čas ukáže (CZ)"))
    assert outcome.book.title == "Jen čas ukáže"


def test_full_audiobook_noise_tokens_removed():
    outcome = parse(_meta("Jeffrey Archer - Jen čas ukáže | Full Audiobook"))
    assert outcome.book.title == "Jen čas ukáže"


def test_narrator_suffix_ignored():
    outcome = parse(
        _meta("Jeffrey Archer - Jen čas ukáže, read by Alex Jennings")
    )
    assert outcome.book.title == "Jen čas ukáže"


@pytest.mark.parametrize(
    "raw",
    [
        "Jeffrey Archer - Jen čas ukáže - Full Audiobook",
        "Jeffrey Archer – Jen čas ukáže – Full Audiobook",
        "Jeffrey Archer | Jen čas ukáže | Audiokniha",
    ],
)
def test_various_separators_all_parse(raw: str):
    outcome = parse(_meta(raw))
    assert outcome.book.author == "Jeffrey Archer"
    assert outcome.book.title == "Jen čas ukáže"
