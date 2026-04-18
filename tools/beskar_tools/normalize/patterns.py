"""Regex patterns used across the normalizer.

Each pattern has a docstring so the intent stays explicit. We compile them
once at import time so the parser stays fast even across large playlists.
"""

from __future__ import annotations

import re

# Marketing suffixes and tags that add no authorial information.
NOISE_TOKENS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bfull\s+audio\s*book\b", re.IGNORECASE),
    re.compile(r"\bfull\s+audiobook\b", re.IGNORECASE),
    re.compile(r"\baudio\s*book\b", re.IGNORECASE),
    re.compile(r"\baudiobook\b", re.IGNORECASE),
    re.compile(r"\baudiokniha\b", re.IGNORECASE),
    re.compile(r"\bmluven[ée]\s+slovo\b", re.IGNORECASE),
    re.compile(r"\bcompletn[íi]\b", re.IGNORECASE),
    re.compile(r"\bcomplete\b", re.IGNORECASE),
    re.compile(r"\bcz\b", re.IGNORECASE),
    re.compile(r"\bsk\b", re.IGNORECASE),
    re.compile(r"\bčesky\b", re.IGNORECASE),
    re.compile(r"\bslovensky\b", re.IGNORECASE),
    re.compile(r"\bhd\b", re.IGNORECASE),
    re.compile(r"\b4k\b", re.IGNORECASE),
    re.compile(r"\bcz\s+dabing\b", re.IGNORECASE),
    re.compile(r"\bčetba\b", re.IGNORECASE),
    re.compile(r"\bpovídky\b", re.IGNORECASE),
)

# Long-dash-style separators between author and title. Order matters: longer
# sequences first so we don't split "—" when the input actually had " - ".
AUTHOR_TITLE_SEPARATORS: tuple[str, ...] = (" — ", " – ", " - ", ": ", " | ")

# Part / disc indicators. These look like "Část 2", "Díl 3", "Part 4".
PART_INDICATOR = re.compile(
    r"""
    [\s\-\–\—,|]*                   # optional separator
    (?:část|cast|časť|cast|díl|dil|part|disc)  # keyword
    \s*
    (?P<n>\d+)                      # part number
    """,
    re.IGNORECASE | re.VERBOSE,
)

# Trailing bracketed junk: "[Subtitles]", "(1080p)", etc.
TRAILING_BRACKETS = re.compile(r"\s*[\[\(\{][^\]\)\}]*[\]\)\}]\s*$")

# Strings like "read by ...", "narrated by ..."
NARRATOR = re.compile(
    r"\b(?:read|narrated|čte|číta|prečítal|predčítal)\s+by\b.*$",
    re.IGNORECASE,
)

# Channel names that are really publishers, not authors. Mapping to the
# canonical attribution expected on the ABS server. Values may be None when
# we want the parser to refuse to use the channel and instead parse the real
# author out of the title.
CHANNEL_ATTRIBUTION: dict[str, str | None] = {
    "Mluvené Slovo": None,  # publisher; author must come from title
    "Audio-Literatúra": None,
    "Audiolib": None,
    "Zaklínač": "Andrzej Sapkowski",
}

# Special-case uploads where we want to fold a specific raw title into a
# canonical (author, title) tuple even before hitting the generic parser.
# These are the cases we already had to fix up by hand today.
UPLOADER_OVERRIDES: dict[str, dict[str, tuple[str, str]]] = {
    # uploader -> {normalized-lower raw title substring: (author, title)}
    "Mluvené Slovo": {
        "experiment profesora wynthorpa": ("Agatha Christie", "Experiment profesora Wynthorpa"),
    },
}
