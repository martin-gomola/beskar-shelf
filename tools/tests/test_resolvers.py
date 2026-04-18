"""Resolver tests with HTTP mocked via pytest-httpx."""

from __future__ import annotations

from pathlib import Path

import httpx
import pytest

from beskar_tools.resolve import OpenLibraryResolver, ResolverCache, WikidataResolver


@pytest.fixture
def cache(tmp_path: Path) -> ResolverCache:
    return ResolverCache(tmp_path / "resolver.sqlite")


def test_openlibrary_returns_canonical_book_for_good_match(httpx_mock, cache: ResolverCache) -> None:
    httpx_mock.add_response(
        url=httpx.URL(
            "https://openlibrary.org/search.json",
            params={"author": "Archer", "title": "Only Time Will Tell", "limit": 5},
        ),
        json={
            "docs": [
                {"title": "Only Time Will Tell", "author_name": ["Jeffrey Archer"]},
                {"title": "Only Time Will Tell: Collector's Edition", "author_name": ["Jeffrey Archer"]},
            ]
        },
    )
    with httpx.Client() as client:
        resolver = OpenLibraryResolver(cache=cache, client=client)
        book = resolver.lookup("Archer", "Only Time Will Tell")

    assert book is not None
    assert book.author == "Jeffrey Archer"
    assert book.title == "Only Time Will Tell"


def test_openlibrary_returns_none_for_weak_match(httpx_mock, cache: ResolverCache) -> None:
    httpx_mock.add_response(
        url=httpx.URL(
            "https://openlibrary.org/search.json",
            params={"author": "Unknown", "title": "xkcd volume 1", "limit": 5},
        ),
        json={"docs": [{"title": "Something else entirely", "author_name": ["Somebody else"]}]},
    )
    with httpx.Client() as client:
        resolver = OpenLibraryResolver(cache=cache, client=client)
        assert resolver.lookup("Unknown", "xkcd volume 1") is None


def test_openlibrary_cache_hit_skips_network(cache: ResolverCache) -> None:
    # Pre-seed cache with a known result.
    cache.set(
        "openlibrary",
        "archer||only time will tell",
        {
            "author": "Jeffrey Archer",
            "title": "Only Time Will Tell",
            "confidence": "high",
            "sources": ["openlibrary"],
            "notes": [],
            "series": None,
            "series_index": None,
        },
    )

    # If the client were actually used, httpx_mock (not installed here) would
    # raise. Passing a closed client verifies the cache short-circuits the path.
    client = httpx.Client()
    client.close()
    resolver = OpenLibraryResolver(cache=cache, client=client)
    book = resolver.lookup("Archer", "Only Time Will Tell")
    assert book is not None
    assert book.author == "Jeffrey Archer"


def test_wikidata_no_book_match_returns_none(httpx_mock, cache: ResolverCache) -> None:
    httpx_mock.add_response(
        url=httpx.URL(
            "https://www.wikidata.org/w/api.php",
            params={
                "action": "wbsearchentities",
                "search": "Zero results",
                "language": "en",
                "uselang": "en",
                "format": "json",
                "type": "item",
                "limit": 5,
            },
        ),
        json={"search": []},
    )
    with httpx.Client() as client:
        resolver = WikidataResolver(cache=cache, client=client)
        assert resolver.lookup("nobody", "Zero results") is None
