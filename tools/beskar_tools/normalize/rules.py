"""Data-driven cleanup rules that used to live in the `abs-organize` bash.

Rules are just (pattern, replacement) style transforms applied in declared
order. Keeping them in a single list makes it trivial to add a new rule
when we spot a new failure mode, without touching the parser.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass


@dataclass(frozen=True)
class Rule:
    """A single parsing rule. Either a regex replacement on the raw title, or
    a full override that replaces (author, title) with fixed canonical values.
    """

    name: str
    applies_to: str  # "title" or "pair"
    fn: Callable[[str, str | None], tuple[str, str | None] | str]

    def apply(self, title: str, uploader: str | None) -> tuple[str, str | None] | str:
        return self.fn(title, uploader)


def _strip_trailing_noise(title: str, _uploader: str | None) -> str:
    cleaned = re.sub(r"\s+", " ", title).strip()
    for suffix_pattern in (
        r"[\s,]*(?:complete|full|audiobook|audio\s*book|audiokniha)\s*$",
        r"[\s,]*cz(?:\s+dabing)?\s*$",
        r"[\s,]*sk\s*$",
        r"[\s,]*\[[^\]]*\]\s*$",
        r"[\s,]*\([^)]*\)\s*$",
    ):
        cleaned = re.sub(suffix_pattern, "", cleaned, flags=re.IGNORECASE).strip()
    return cleaned


_BUILTIN_RULES: list[Rule] = [
    Rule(name="strip-trailing-noise", applies_to="title", fn=_strip_trailing_noise),
]


def load_rules() -> list[Rule]:
    """Return the active cleanup rule set. A future version may load YAML."""

    return list(_BUILTIN_RULES)


def apply_rules(title: str, uploader: str | None, rules: list[Rule] | None = None) -> str:
    """Apply each rule in order, returning the rewritten title."""

    active = rules or load_rules()
    current = title
    for rule in active:
        if rule.applies_to != "title":
            continue
        result = rule.apply(current, uploader)
        if isinstance(result, str):
            current = result
    return current
