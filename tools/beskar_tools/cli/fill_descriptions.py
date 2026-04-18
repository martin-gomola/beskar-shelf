"""fill-abs-descriptions: list/export/apply missing ABS descriptions."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import click

from ..abs_client import ABSClient, ABSError
from ..config import load_config


def _find_missing(items: list[dict]) -> list[dict]:
    results: list[dict] = []
    for item in items:
        metadata = (item.get("media") or {}).get("metadata") or {}
        description = (metadata.get("description") or "").strip()
        if description:
            continue
        results.append(
            {
                "id": item["id"],
                "title": metadata.get("title") or "",
                "author": metadata.get("authorName") or metadata.get("author") or "",
                "series": metadata.get("seriesName") or "",
                "publishedYear": metadata.get("publishedYear") or "",
                "description": "",
            }
        )
    return results


@click.command(help="Export and apply missing Audiobookshelf descriptions.")
@click.option("--list-missing", "list_missing", is_flag=True, help="Print books with missing descriptions.")
@click.option(
    "--export-missing",
    "export_path",
    type=click.Path(dir_okay=False, path_type=Path),
    help="Write missing-description entries to a JSON file.",
)
@click.option(
    "--apply",
    "apply_path",
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
    help="Apply descriptions from a JSON file.",
)
def main(list_missing: bool, export_path: Path | None, apply_path: Path | None) -> int:
    if not (list_missing or export_path or apply_path):
        click.echo(
            "Choose one or more actions: --list-missing, --export-missing, --apply", err=True
        )
        return 2

    config = load_config()
    if not config.have_abs_api() or not config.abs_library_id:
        click.echo(
            "ABS_URL (or ABS_LOCAL_URL), ABS_TOKEN, and ABS_LIBRARY_ID must be set in .env.",
            err=True,
        )
        return 1

    try:
        with ABSClient.from_config(config) as client:
            items = client.library_items(config.abs_library_id)
    except ABSError as exc:
        click.echo(f"Failed to read library items: {exc}", err=True)
        return 1

    missing = _find_missing(items)

    if list_missing:
        for entry in missing:
            click.echo(f"{entry['id']}\t{entry['author']}\t{entry['title']}")
        click.echo(f"\nMissing descriptions: {len(missing)}")

    if export_path:
        export_path.write_text(json.dumps(missing, ensure_ascii=False, indent=2) + "\n")
        click.echo(f"Exported {len(missing)} entries to {export_path}")

    if apply_path:
        entries = json.loads(apply_path.read_text())
        updated = 0
        errors: list[str] = []
        with ABSClient.from_config(config) as client:
            for entry in entries:
                description = (entry.get("description") or "").strip()
                item_id = entry.get("id")
                if not item_id or not description:
                    continue
                try:
                    client.patch_media(item_id, {"description": description})
                    updated += 1
                except ABSError as exc:
                    errors.append(f"{item_id}: {exc}")
        click.echo(f"Updated descriptions: {updated}")
        if errors:
            click.echo("\nErrors:", err=True)
            for error in errors:
                click.echo(f"- {error}", err=True)
            return 1

    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
