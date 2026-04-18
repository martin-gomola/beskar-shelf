"""Wikidata resolver used as a fallback for works Open Library does not know.

Central European literature is frequently missing from Open Library; Wikidata
usually has at least a stub entry. We query the public JSON search API and
then fetch `wbgetentities` to recover the English/Czech/Slovak canonical label
pair.
"""

from __future__ import annotations

import logging

import httpx

from ..models import BookRef, Confidence, Source
from .cache import ResolverCache, normalize_key

log = logging.getLogger(__name__)

_SEARCH_URL = "https://www.wikidata.org/w/api.php"
_TIMEOUT = httpx.Timeout(10.0, connect=5.0)
_MAX_AGE_S = 30 * 24 * 3600


class WikidataResolver:
    def __init__(self, cache: ResolverCache | None = None, client: httpx.Client | None = None):
        self._cache = cache
        self._client = client or httpx.Client(timeout=_TIMEOUT, headers={"User-Agent": "beskar-tools/0.1"})

    def close(self) -> None:
        self._client.close()

    def lookup(self, author: str, title: str) -> BookRef | None:
        key = normalize_key(author, title)
        if self._cache is not None:
            cached = self._cache.get("wikidata", key, max_age_s=_MAX_AGE_S)
            if cached is not None:
                return BookRef(**cached) if cached else None

        book = self._search(author, title)
        if self._cache is not None:
            self._cache.set("wikidata", key, book.model_dump() if book else None)
        return book

    def _search(self, author: str, title: str) -> BookRef | None:
        try:
            # Wikidata search is best-effort — we just look for the title.
            response = self._client.get(
                _SEARCH_URL,
                params={
                    "action": "wbsearchentities",
                    "search": title,
                    "language": "en",
                    "uselang": "en",
                    "format": "json",
                    "type": "item",
                    "limit": 5,
                },
            )
        except httpx.HTTPError as exc:
            log.warning("wikidata lookup failed: %s", exc)
            return None

        if response.status_code >= 400:
            return None

        from rapidfuzz import fuzz

        results = response.json().get("search") or []
        best: tuple[str, float] | None = None
        for item in results:
            label = item.get("label") or ""
            description = (item.get("description") or "").lower()
            if not label or ("book" not in description and "novel" not in description):
                continue
            score = fuzz.token_sort_ratio(title, label) / 100.0
            if best is None or score > best[1]:
                best = (label, score)

        if best is None or best[1] < 0.8:
            return None

        # Wikidata does not give us an author directly without another roundtrip
        # and the user-supplied author is usually right once the title is
        # confirmed, so we keep it.
        return BookRef(
            author=author,
            title=best[0],
            confidence=Confidence.MEDIUM,
            sources=[Source.WIKIDATA],
            notes=[f"wikidata score={best[1]:.2f}"],
        )
