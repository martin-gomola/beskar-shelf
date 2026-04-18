"""Declarative rules for cleaning up post-download folder trees.

These rules encode the historical fixes that used to live as hand-written
`sed` invocations inside the bash `abs-organize`. Keeping them as data makes
it easy to add a new rule when we hit a new failure mode, and makes every
transformation unit-testable.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class PlannedMove:
    src: Path
    dst: Path


@dataclass(frozen=True)
class AuthorRule:
    """How to rewrite all books under a given author folder."""

    source_author: str  # folder name to look for
    target_author: str  # canonical author folder to move books into
    transform: Callable[[str], str]  # rename the book directory
    drop_empty_author: bool = True


def _strip_common(title: str) -> str:
    cleaned = re.sub(r"\s+", " ", title).strip()
    for pattern in (
        r"\s*\((?:CZ|SK|EN)\)\s*$",
        r"\s+(?:SK|CZ|EN)\s*$",
    ):
        cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE)
    return cleaned.strip(" -–—")


def _rule_mluvene_slovo(title: str) -> str:
    for prefix in ("Jules Verne - ", "Jules Verne-", "Jules Verne "):
        if title.startswith(prefix):
            title = title[len(prefix) :]
            break
    return _strip_common(title)


def _rule_zaklinac(title: str) -> str:
    t = re.sub(r"\s*-\s*[Pp]oviedka[^-]*", "", title)
    t = re.sub(
        r"\s*-\s*[Kk]niha\s*-?\s*(?:I{1,3}|IV|V|VI{0,3}|[1-7])\s*$",
        "",
        t,
    )
    t = re.sub(r"\s*-\s*[Zz]aklínač\s*", "", t)
    # "Poslední přání - Menší zlo" → take the second half (book → story).
    if re.match(r"^[Pp]oslední (?:přání|praní|prání)\s*-\s*", t):
        t = re.sub(r"^[Pp]oslední (?:přání|praní|prání)\s*-\s*", "", t)
    return _strip_common(t).rstrip("- ")


def _rule_emhyr(title: str) -> str:
    t = re.sub(r"\s*-\s*[Pp]oviedka[^-]*", "", title)
    t = re.sub(r"\s*-\s*[Gg]erald z Rivi[ei]\s*$", "", t)
    return _strip_common(t).rstrip("- ")


def _rule_identity(title: str) -> str:
    return _strip_common(title)


def _rule_andrzej(title: str) -> str:
    t = re.sub(r"^Zaklínač\s*-\s*", "", title)
    return _strip_common(t)


DEFAULT_AUTHOR_RULES: tuple[AuthorRule, ...] = (
    AuthorRule("Mluvené Slovo", "Jules Verne", _rule_mluvene_slovo),
    AuthorRule("Zaklínač", "Andrzej Sapkowski", _rule_zaklinac),
    AuthorRule("Emhyr var Emreis", "Andrzej Sapkowski", _rule_emhyr),
    AuthorRule(
        "Andrzej Sapkowski", "Andrzej Sapkowski", _rule_andrzej, drop_empty_author=False
    ),
    AuthorRule("Jules Verne", "Jules Verne", _rule_identity, drop_empty_author=False),
)


def plan_moves(
    downloads: Path,
    rules: tuple[AuthorRule, ...] = DEFAULT_AUTHOR_RULES,
) -> list[PlannedMove]:
    """Walk the downloads tree and plan renames according to `rules`."""

    moves: list[PlannedMove] = []
    for rule in rules:
        source_dir = downloads / rule.source_author
        if not source_dir.is_dir():
            continue
        for book_dir in sorted(source_dir.iterdir()):
            if not book_dir.is_dir():
                continue
            new_title = rule.transform(book_dir.name)
            if not new_title:
                continue
            target = downloads / rule.target_author / new_title
            if target == book_dir:
                continue
            moves.append(PlannedMove(src=book_dir, dst=target))
    return moves
