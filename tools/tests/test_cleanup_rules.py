"""Tests for the declarative folder-cleanup rules (port of abs-organize)."""

from __future__ import annotations

from pathlib import Path

from beskar_tools.organize.cleanup_rules import DEFAULT_AUTHOR_RULES, plan_moves


def _make_tree(root: Path, spec: dict[str, list[str]]) -> None:
    for author, books in spec.items():
        for book in books:
            (root / author / book).mkdir(parents=True, exist_ok=True)


def test_mluvene_slovo_books_move_to_jules_verne(tmp_path: Path) -> None:
    _make_tree(tmp_path, {"Mluvené Slovo": ["Jules Verne - Tajuplný ostrov SK"]})

    moves = plan_moves(tmp_path, DEFAULT_AUTHOR_RULES)

    assert len(moves) == 1
    assert moves[0].src == tmp_path / "Mluvené Slovo/Jules Verne - Tajuplný ostrov SK"
    assert moves[0].dst == tmp_path / "Jules Verne/Tajuplný ostrov"


def test_zaklinac_story_moves_and_keeps_only_story_title(tmp_path: Path) -> None:
    _make_tree(
        tmp_path,
        {"Zaklínač": ["Poslední prání - Hlas rozumu - Zaklínač - poviedka - kniha I"]},
    )

    moves = plan_moves(tmp_path, DEFAULT_AUTHOR_RULES)

    assert len(moves) == 1
    assert moves[0].dst == tmp_path / "Andrzej Sapkowski/Hlas rozumu"


def test_andrzej_sapkowski_trailing_language_tag_is_stripped(tmp_path: Path) -> None:
    _make_tree(tmp_path, {"Andrzej Sapkowski": ["Zaklínač- Něco víc (CZ)"]})

    moves = plan_moves(tmp_path, DEFAULT_AUTHOR_RULES)

    assert len(moves) == 1
    assert moves[0].dst == tmp_path / "Andrzej Sapkowski/Něco víc"


def test_already_clean_folder_produces_no_move(tmp_path: Path) -> None:
    _make_tree(tmp_path, {"Jules Verne": ["Tajuplný ostrov"]})

    moves = plan_moves(tmp_path, DEFAULT_AUTHOR_RULES)

    assert moves == []
