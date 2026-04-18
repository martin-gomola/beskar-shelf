"""fix-ebooks: reorganize flat ebook files into per-book subdirectories."""

from __future__ import annotations

import sys
from pathlib import Path

import click


@click.command(help="Reorganize flat ebook files under AUTHOR_DIR into per-book subdirectories.")
@click.argument("author_dir", type=click.Path(exists=True, file_okay=False, path_type=Path))
def main(author_dir: Path) -> None:
    moved = 0
    for entry in sorted(author_dir.iterdir()):
        if not entry.is_file():
            continue
        book_name = entry.stem
        book_dir = author_dir / book_name
        book_dir.mkdir(exist_ok=True)
        target = book_dir / entry.name
        entry.rename(target)
        click.echo(f"  {entry.name} -> {book_name}/")
        moved += 1

    click.echo(f"Done. Moved {moved} file(s) into per-book directories.")
    click.echo("Trigger a library scan in Audiobookshelf to pick up the changes.")


if __name__ == "__main__":
    sys.exit(main() or 0)
