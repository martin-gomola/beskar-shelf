"""optimize-pdf: shrink and linearise PDFs for ABS streaming + offline reading.

Two modes:

  --lossless    qpdf only: object-stream packing + linearisation. Visually
                identical to the source. Typical 5-15% savings on already-
                tight PDFs, plus the streaming win (linearised PDFs let the
                ABS reader show page 1 without downloading the whole file).

  default       pymupdf + qpdf: re-encode raster images as JPEG quality=N
                (default 85), subset embedded fonts, drop unused objects, and
                linearise. Typical 60-90% savings on image-heavy art books.
                Quality 85 is the publication-grade sweet spot. Use 75-80 to
                push further on a phone-only library, 90+ for near-original
                quality at smaller savings.

Pipeline notes:
  - Each unique image xref is re-encoded once, not once per page reference,
    so a single illustration used on 50 pages costs one JPEG re-encode.
  - We skip images already smaller than ~50 KB (the JPEG header overhead can
    make them grow) and skip any re-encode that doesn't shave at least 10%.
  - Page.replace_image() handles Filter / BitsPerComponent / ColorSpace
    bookkeeping correctly; never bypass it with manual xref_set_key calls -
    that produced filter-mismatch warnings in earlier attempts.
  - MuPDF dropped its own linearisation in late 2024
    (pdf_save_document raises FzErrorArgument: "Linearisation is no longer
    supported"), so we always pipe the saved file through qpdf --linearize.

Originally ported from vhetts-blueprints/tools/optimize-pdf/optimize_pdf.py.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import time
from pathlib import Path

import click

MIN_IMAGE_BYTES = 50_000  # below this, JPEG overhead can grow the file
MIN_SAVING_RATIO = 0.90  # only swap if new size < 90% of original


class OptimizeError(click.ClickException):
    """User-facing optimisation error."""


def _check_qpdf() -> None:
    if shutil.which("qpdf") is None:
        raise OptimizeError(
            "qpdf not found on PATH. Install with `brew install qpdf` "
            "(macOS) or `apt install qpdf` (Debian/Ubuntu)."
        )


def _import_fitz():
    try:
        import fitz  # type: ignore[import-not-found]
    except ImportError as exc:
        raise OptimizeError(
            "pymupdf (fitz) is not installed in the tools venv. "
            "Run `make install-tools` to refresh dependencies."
        ) from exc
    return fitz


def linearise_in_place(path: Path) -> None:
    """Run qpdf --linearize --replace-input. Lossless. Raises on failure."""

    subprocess.run(
        [
            "qpdf",
            "--linearize",
            "--object-streams=generate",
            "--replace-input",
            str(path),
        ],
        check=True,
    )


def linearise_in_place_quiet(path: Path) -> tuple[bool, str | None]:
    """Best-effort lineariser for batch use.

    Returns ``(True, None)`` on success, or ``(False, message)`` if qpdf is
    missing or fails on this file. Never raises - callers (e.g. fix-ebooks)
    process many PDFs and need to keep going past one bad input.

    qpdf output is captured so batch callers can format their own one-line
    summary instead of letting qpdf's stderr interleave with their progress.
    Use :func:`linearise_in_place` when a hard failure should abort the run.
    """

    try:
        subprocess.run(
            [
                "qpdf",
                "--linearize",
                "--object-streams=generate",
                "--replace-input",
                str(path),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        return False, "qpdf not found on PATH"
    except subprocess.CalledProcessError as exc:
        msg = (exc.stderr or exc.stdout or "").strip().splitlines()
        # qpdf is chatty; the last non-empty line is usually the actual error.
        last = msg[-1] if msg else ""
        return False, last or f"qpdf exited {exc.returncode}"
    return True, None


def lossless_optimise(src: Path, dst: Path) -> None:
    """qpdf-only path: object stream packing + linearisation."""

    if dst.exists():
        dst.unlink()
    subprocess.run(
        [
            "qpdf",
            "--linearize",
            "--object-streams=generate",
            str(src),
            str(dst),
        ],
        check=True,
    )


def lossy_optimise(src: Path, dst: Path, quality: int) -> tuple[int, int, int]:
    """pymupdf re-encode of raster images, then qpdf linearise.

    Returns (total_unique_images, recompressed_count, raw_bytes_saved).
    """

    fitz = _import_fitz()

    if dst.exists():
        dst.unlink()

    doc = fitz.open(src)
    total = recompressed = 0
    raw_saved = 0
    seen: set[int] = set()

    try:
        for page in doc:
            for info in page.get_images(full=True):
                xref = info[0]
                if xref in seen:
                    continue
                seen.add(xref)
                total += 1

                base = doc.extract_image(xref)
                if not base:
                    continue
                orig_bytes = base["image"]
                if len(orig_bytes) < MIN_IMAGE_BYTES:
                    continue

                pix = None
                try:
                    pix = fitz.Pixmap(doc, xref)
                    if pix.alpha:
                        pix = fitz.Pixmap(fitz.csRGB, pix)
                    new_jpg = pix.tobytes(output="jpeg", jpg_quality=quality)
                    if len(new_jpg) < len(orig_bytes) * MIN_SAVING_RATIO:
                        page.replace_image(xref, stream=new_jpg)
                        raw_saved += len(orig_bytes) - len(new_jpg)
                        recompressed += 1
                except Exception:
                    # Exotic colourspaces (CMYK, DeviceN, image masks) and any
                    # other re-encode failure leave the original image in place.
                    pass
                finally:
                    pix = None

        doc.subset_fonts()
        doc.save(
            dst,
            garbage=4,
            deflate=True,
            deflate_images=True,
            deflate_fonts=True,
            clean=True,
        )
    finally:
        doc.close()

    linearise_in_place(dst)
    return total, recompressed, raw_saved


def human_size(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


@click.command(
    help=(
        "Shrink and linearise a PDF for ABS streaming + offline reading. "
        "Default mode re-encodes raster images as JPEG; --lossless skips "
        "image recompression and only repacks/linearises with qpdf."
    )
)
@click.argument(
    "input_pdf",
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
)
@click.option(
    "--output",
    "-o",
    "output",
    type=click.Path(dir_okay=False, path_type=Path),
    default=None,
    help="Output PDF (default: <input-stem>.opt.pdf next to source).",
)
@click.option(
    "--lossless",
    is_flag=True,
    help="qpdf-only: object-stream pack + linearise. Visually identical to source.",
)
@click.option(
    "--quality",
    "-q",
    type=click.IntRange(1, 100),
    default=85,
    show_default=True,
    help="JPEG quality for raster image re-encode. Ignored with --lossless.",
)
def main(
    input_pdf: Path,
    output: Path | None,
    lossless: bool,
    quality: int,
) -> int:
    src = input_pdf.expanduser().resolve()
    if src.suffix.lower() != ".pdf":
        raise OptimizeError(f"input is not a PDF: {src}")

    dst = (
        output.expanduser().resolve()
        if output is not None
        else src.with_name(f"{src.stem}.opt.pdf")
    )
    if dst == src:
        raise OptimizeError("output cannot be the same file as input")

    _check_qpdf()
    if not lossless:
        _import_fitz()

    src_size = src.stat().st_size
    click.echo(f"Source: {src}")
    click.echo(f"        {human_size(src_size)}")

    t0 = time.time()
    if lossless:
        click.echo("Mode:   lossless (qpdf object-stream + linearise)")
        lossless_optimise(src, dst)
    else:
        click.echo(f"Mode:   lossy (pymupdf JPEG q={quality}, then qpdf linearise)")
        total, recompressed, raw_saved = lossy_optimise(src, dst, quality)
        click.echo(
            f"        recompressed {recompressed}/{total} images, "
            f"raw stream savings {human_size(raw_saved)}"
        )
    elapsed = time.time() - t0

    dst_size = dst.stat().st_size
    pct = 100 * (1 - dst_size / src_size) if src_size else 0
    click.echo(f"Output: {dst}")
    click.echo(f"        {human_size(dst_size)} ({pct:.1f}% smaller, {elapsed:.1f}s)")
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
