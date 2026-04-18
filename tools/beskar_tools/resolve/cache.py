"""SQLite-backed cache for resolver lookups.

Open Library and Wikidata are rate-limited and sometimes slow. We cache by a
normalized query string so repeat downloads of the same book never hit the
network twice.
"""

from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path
from typing import Any


class ResolverCache:
    """Plain key -> json-serialized-value cache with timestamps."""

    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(path)
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS resolver_cache (
                namespace TEXT NOT NULL,
                key       TEXT NOT NULL,
                value     TEXT NOT NULL,
                ts        INTEGER NOT NULL,
                PRIMARY KEY (namespace, key)
            )
            """
        )
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()

    def __enter__(self) -> ResolverCache:
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()

    def get(self, namespace: str, key: str, *, max_age_s: int | None = None) -> Any | None:
        row = self._conn.execute(
            "SELECT value, ts FROM resolver_cache WHERE namespace = ? AND key = ?",
            (namespace, key),
        ).fetchone()
        if row is None:
            return None
        value, ts = row
        if max_age_s is not None and (time.time() - ts) > max_age_s:
            return None
        return json.loads(value)

    def set(self, namespace: str, key: str, value: Any) -> None:
        self._conn.execute(
            """
            INSERT INTO resolver_cache (namespace, key, value, ts)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(namespace, key) DO UPDATE SET value=excluded.value, ts=excluded.ts
            """,
            (namespace, key, json.dumps(value, ensure_ascii=False), int(time.time())),
        )
        self._conn.commit()


def normalize_key(author: str, title: str) -> str:
    """Cache key used by resolvers."""

    return f"{author.strip().lower()}||{title.strip().lower()}"
