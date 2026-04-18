"""Open Library search-based resolver.

Open Library's search API returns canonical author + title pairs keyed by
lowercase query. We use it to double-check the parser output and fix cases
where the parser mis-assigned which side of the dash is the author.

Docs: https://openlibrary.org/dev/docs/api/search
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx

from ..models import BookRef, Confidence, Source
from .cache import ResolverCache, normalize_key

log = logging.getLogger(__name__)

_API_URL = "https://openlibrary.org/search.json"
_TIMEOUT = httpx.Timeout(10.0, connect=5.0)
_MAX_AGE_S = 30 * 24 * 3600  # 30 days


@dataclass
class Match:
    author: str
    title: str
    score: float


class OpenLibraryResolver:
    def __init__(self, cache: ResolverCache | None = None, client: httpx.Client | None = None):
        self._cache = cache
        self._client = client or httpx.Client(timeout=_TIMEOUT, headers={"User-Agent": "beskar-tools/0.1"})

    def close(self) -> None:
        self._client.close()

    def lookup(self, author: str, title: str) -> BookRef | None:
        """Return a canonical BookRef if Open Library has a confident match."""

        key = normalize_key(author, title)
        if self._cache is not None:
            cached = self._cache.get("openlibrary", key, max_age_s=_MAX_AGE_S)
            if cached is not None:
                return BookRef(**cached) if cached else None

        match = self._search(author, title)
        result = None
        if match:
            result = BookRef(
                author=match.author,
                title=match.title,
                confidence=Confidence.HIGH,
                sources=[Source.OPENLIBRARY],
                notes=[f"openlibrary score={match.score:.2f}"],
            )

        if self._cache is not None:
            self._cache.set("openlibrary", key, result.model_dump() if result else None)

        return result

    def _search(self, author: str, title: str) -> Match | None:
        try:
            response = self._client.get(
                _API_URL,
                params={"author": author, "title": title, "limit": 5},
            )
        except httpx.HTTPError as exc:
            log.warning("openlibrary lookup failed: %s", exc)
            return None

        if response.status_code >= 400:
            log.warning("openlibrary HTTP %s for '%s' / '%s'", response.status_code, author, title)
            return None

        payload = response.json()
        docs = payload.get("docs") or []
        if not docs:
            return None

        from rapidfuzz import fuzz

        # Score each doc by author+title similarity.
        best: Match | None = None
        for doc in docs[:5]:
            ol_title = (doc.get("title") or "").strip()
            ol_authors = doc.get("author_name") or []
            if not ol_title or not ol_authors:
                continue
            ol_author = ol_authors[0]
            score = (
                fuzz.token_sort_ratio(title, ol_title) * 0.6
                + fuzz.token_sort_ratio(author, ol_author) * 0.4
            ) / 100.0
            if best is None or score > best.score:
                best = Match(author=ol_author, title=ol_title, score=score)

        if best is None or best.score < 0.75:
            return None
        return best
