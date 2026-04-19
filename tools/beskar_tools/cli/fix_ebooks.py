"""fix-ebooks: reorganize flat ebook files into per-book subdirectories.

PDFs are also linearised in place via qpdf so the ABS reader can stream the
first page without downloading the whole file. Pass ``--no-linearise`` to skip
that step. If qpdf isn't on PATH, linearisation is skipped with a single
upfront warning - the file moves still happen.
"""

from __future__ import annotations

import sys
from pathlib import Path

import click

from beskar_tools.cli.optimize_pdf import linearise_in_place_quiet


@click.command(
    help=(
        "Reorganize flat ebook files under AUTHOR_DIR into per-book "
        "subdirectories. PDFs are linearised in place for ABS streaming "
        "(use --no-linearise to skip)."
    )
)
@click.argument("author_dir", type=click.Path(exists=True, file_okay=False, path_type=Path))
@click.option(
    "--linearise/--no-linearise",
    default=True,
    show_default=True,
    help="Run qpdf --linearize on every PDF after moving it.",
)
def main(author_dir: Path, linearise: bool) -> None:
    moved = 0
    linearised = 0
    skipped_qpdf_missing = False

    for entry in sorted(author_dir.iterdir()):
        if not entry.is_file():
            continue
        book_name = entry.stem
        book_dir = author_dir / book_name
        book_dir.mkdir(exist_ok=True)
        target = book_dir / entry.name
        entry.rename(target)
        moved += 1

        suffix_note = ""
        if linearise and target.suffix.lower() == ".pdf":
            if skipped_qpdf_missing:
                suffix_note = "  (linearise skipped: qpdf missing)"
            else:
                ok, err = linearise_in_place_quiet(target)
                if ok:
                    linearised += 1
                    suffix_note = "  (linearised)"
                elif err and "qpdf not found" in err:
                    skipped_qpdf_missing = True
                    suffix_note = "  (linearise skipped: qpdf missing)"
                    click.echo(
                        "  ! qpdf not on PATH; install with `brew install qpdf` "
                        "(macOS) or `apt install qpdf` (Debian/Ubuntu) to enable "
                        "PDF auto-linearisation."
                    )
                else:
                    suffix_note = f"  (linearise failed: {err})"

        click.echo(f"  {entry.name} -> {book_name}/{suffix_note}")

    click.echo(f"Done. Moved {moved} file(s) into per-book directories.")
    if linearise and linearised:
        click.echo(f"      Linearised {linearised} PDF(s) for streaming.")
    click.echo("Trigger a library scan in Audiobookshelf to pick up the changes.")


if __name__ == "__main__":
    sys.exit(main() or 0)
