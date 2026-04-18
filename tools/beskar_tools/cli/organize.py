"""abs-organize: reorganize existing download trees into ABS layout."""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

import click
from rich.console import Console

from ..config import REPO_ROOT
from ..organize.cleanup_rules import PlannedMove, plan_moves

console = Console()


def _rel(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def _execute(move: PlannedMove) -> None:
    move.dst.parent.mkdir(parents=True, exist_ok=True)
    if move.dst.exists():
        # Merge: move each child into the existing destination.
        for child in list(move.src.iterdir()):
            target = move.dst / child.name
            if target.exists():
                continue
            shutil.move(str(child), target)
        # Remove the now-empty (or DS_Store-only) source.
        try:
            move.src.rmdir()
        except OSError:
            shutil.rmtree(move.src, ignore_errors=True)
    else:
        shutil.move(str(move.src), move.dst)


def _prune_empty_authors(downloads: Path) -> list[Path]:
    removed: list[Path] = []
    for child in downloads.iterdir():
        if not child.is_dir():
            continue
        leftovers = [p for p in child.iterdir() if p.name != ".DS_Store"]
        if leftovers:
            continue
        try:
            shutil.rmtree(child)
            removed.append(child)
        except OSError:
            pass
    return removed


@click.command(help="Reorganize downloads into Audiobookshelf-compatible Author/Title structure.")
@click.argument(
    "downloads",
    type=click.Path(path_type=Path),
    required=False,
)
@click.option("--dry-run", is_flag=True, help="Print planned moves without touching the filesystem.")
def main(downloads: Path | None, dry_run: bool) -> int:
    root = downloads or (REPO_ROOT / "downloads")
    if not root.is_dir():
        console.print(f"[red]Downloads directory not found:[/red] {root}")
        return 1

    moves = plan_moves(root)

    if not moves:
        console.print("Nothing to reorganize. All folders already match ABS structure.")
        return 0

    console.print(f"[bold]Planned moves ({len(moves)}):[/bold]\n")
    for move in moves:
        console.print(f"  {_rel(move.src, root)}")
        console.print(f"    → {_rel(move.dst, root)}\n")

    if dry_run:
        console.print("[yellow]Dry run — no files moved.[/yellow]")
        return 0

    console.print("Executing...")
    for move in moves:
        _execute(move)
        console.print(f"  [green]✓[/green] {_rel(move.src, root)} → {_rel(move.dst, root)}")

    removed = _prune_empty_authors(root)
    for path in removed:
        console.print(f"  [green]✓[/green] Removed empty: {path.name}/")

    console.print("\nDone. Rescan the library in Audiobookshelf to pick up the changes.")
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
