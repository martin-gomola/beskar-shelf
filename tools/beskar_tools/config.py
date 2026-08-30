"""Environment and configuration loading for Audiobookshelf helpers."""

from __future__ import annotations

from pathlib import Path

from dotenv import dotenv_values
from pydantic import BaseModel, Field

REPO_ROOT = Path(__file__).resolve().parent.parent.parent


class BeskarConfig(BaseModel):
    """Runtime configuration assembled from .env files and overrides."""

    abs_url: str | None = Field(default=None, description="Public Audiobookshelf URL")
    abs_local_url: str | None = Field(
        default=None, description="LAN-side Audiobookshelf URL used for API calls"
    )
    abs_token: str | None = None
    abs_library_id: str | None = None
    abs_username: str | None = None

    @property
    def effective_abs_url(self) -> str | None:
        """Prefer the LAN URL for API calls so we don't go through WAN/HTTPS."""
        return self.abs_local_url or self.abs_url

    def have_abs_api(self) -> bool:
        return bool(self.effective_abs_url and self.abs_token)


def load_config(overrides: dict[str, str] | None = None) -> BeskarConfig:
    """Load the app-level .env file and apply explicit overrides."""

    merged: dict[str, str] = {}
    env_path = REPO_ROOT / ".env"
    if env_path.exists():
        merged.update({k: v for k, v in dotenv_values(env_path).items() if v is not None})
    if overrides:
        merged.update(overrides)

    return BeskarConfig(
        abs_url=merged.get("ABS_URL") or None,
        abs_local_url=merged.get("ABS_LOCAL_URL") or None,
        abs_token=merged.get("ABS_TOKEN") or None,
        abs_library_id=merged.get("ABS_LIBRARY_ID") or None,
        abs_username=merged.get("ABS_USERNAME") or None,
    )
