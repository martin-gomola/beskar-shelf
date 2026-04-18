"""Knowledge-base resolvers to disambiguate parser output."""

from .cache import ResolverCache
from .openlibrary import OpenLibraryResolver
from .wikidata import WikidataResolver

__all__ = ["OpenLibraryResolver", "ResolverCache", "WikidataResolver"]
