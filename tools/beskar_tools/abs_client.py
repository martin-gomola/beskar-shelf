"""Audiobookshelf HTTP client.

Covers the operations the tools need: library listing, media patch, login. We
use httpx because it is already a dependency for resolvers; keeping one HTTP
client avoids mixing urllib and requests across the codebase.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from .config import BeskarConfig

log = logging.getLogger(__name__)


class ABSError(RuntimeError):
    """Base for Audiobookshelf API failures."""


class ABSClient:
    """Small wrapper around the subset of ABS endpoints we need."""

    def __init__(self, base_url: str, token: str, *, timeout: float = 60.0) -> None:
        self._client = httpx.Client(
            base_url=base_url.rstrip("/"),
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/json",
                "User-Agent": "beskar-tools/0.1",
            },
            timeout=timeout,
        )

    @classmethod
    def from_config(cls, config: BeskarConfig) -> ABSClient | None:
        if not config.have_abs_api():
            return None
        return cls(config.effective_abs_url, config.abs_token)

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> ABSClient:
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()

    def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict | None = None,
        params: dict | None = None,
    ) -> Any:
        try:
            response = self._client.request(method, path, json=json, params=params)
        except httpx.HTTPError as exc:
            raise ABSError(f"{method} {path} failed: {exc}") from exc
        if response.status_code >= 400:
            raise ABSError(
                f"{method} {path} returned {response.status_code}: {response.text[:200]}"
            )
        if not response.content:
            return None
        return response.json()

    def library_items(self, library_id: str) -> list[dict]:
        """Return all items in a library with full metadata."""

        payload = self._request(
            "GET",
            f"/api/libraries/{library_id}/items",
            params={
                "limit": 2000,
                "minified": 0,
                "collapseseries": 0,
                "sort": "media.metadata.title",
                "desc": 0,
            },
        )
        if isinstance(payload, dict):
            return payload.get("results") or []
        return payload or []

    def patch_media(self, item_id: str, metadata: dict) -> None:
        """Update media metadata (description, title, etc.) for one item."""

        self._request(
            "PATCH",
            f"/api/items/{item_id}/media",
            json={"metadata": metadata},
        )

    @staticmethod
    def login(base_url: str, username: str, password: str) -> str:
        """Exchange credentials for an API token."""

        response = httpx.post(
            f"{base_url.rstrip('/')}/login",
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "x-return-tokens": "true",
            },
            json={"username": username, "password": password},
            timeout=30,
        )
        if response.status_code >= 400:
            raise ABSError(f"login failed: HTTP {response.status_code} {response.text[:200]}")

        payload = response.json()
        candidates = [
            (payload.get("user") or {}).get("token"),
            (payload.get("user") or {}).get("accessToken"),
            ((payload.get("response") or {}).get("user") or {}).get("token"),
            ((payload.get("response") or {}).get("user") or {}).get("accessToken"),
        ]
        for token in candidates:
            if token:
                return token
        raise ABSError("login succeeded but no token was returned")
