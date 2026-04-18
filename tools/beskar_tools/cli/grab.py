"""grab: download YouTube audiobooks, normalize metadata, write ABS layout.

This is the orchestrator. It delegates each stage to a focused module:

  yt.py            -> yt-dlp metadata + download
  normalize/       -> BookRef with confidence
  resolve/         -> Open Library + Wikidata fallback (cached)
  organize/        -> filesystem layout, optionally merging into an existing
                      ABS entry for multi-part books
  tag.py           -> mutagen ID3 tags so ABS can read metadata from the files
                      even if folder names are wrong

The high-level shape mirrors the old bash `grab` so the Makefile targets stay
the same, but every step is now typed and unit-testable.
"""

from __future__ import annotations

import logging
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

import click
from rich.console import Console
from rich.progress import BarColumn, Progress, TextColumn, TimeRemainingColumn

from .. import audio, tag, yt
from ..abs_client import ABSClient
from ..config import BeskarConfig, load_config
from ..models import BookRef, Confidence, VideoMetadata
from ..normalize import ParseOutcome, parse
from ..organize.layout import write_book_layout
from ..organize.merge import MergePlanner
from ..resolve import OpenLibraryResolver, ResolverCache, WikidataResolver

console = Console()
log = logging.getLogger(__name__)


# --- preflight ---------------------------------------------------------------


REQUIRED_BINARIES = ("ffmpeg", "ffprobe")


@dataclass
class PreflightReport:
    ok: bool
    errors: list[str]
    warnings: list[str]


def preflight(config: BeskarConfig) -> PreflightReport:
    errors: list[str] = []
    warnings: list[str] = []

    for binary in REQUIRED_BINARIES:
        if shutil.which(binary) is None:
            errors.append(f"missing required binary: {binary}")

    if not config.links_file.exists():
        errors.append(f"missing links file: {config.links_file}")
    try:
        config.output_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        errors.append(f"output directory not writable: {config.output_dir} ({exc})")

    if not config.have_abs_api():
        warnings.append(
            "ABS API not configured — merge detection will fall back to the mounted "
            "audiobooks folder only."
        )

    return PreflightReport(ok=not errors, errors=errors, warnings=warnings)


# --- link iteration ---------------------------------------------------------


def _iter_links(path: Path, limit: int | None = None) -> list[str]:
    if not path.exists():
        return []
    urls: list[str] = []
    for raw in path.read_text().splitlines():
        url = raw.strip()
        if not url or url.startswith("#"):
            continue
        urls.append(url)
        if limit and len(urls) >= limit:
            break
    return urls


def _remove_link(path: Path, target: str) -> None:
    if not path.exists():
        return
    lines = [line for line in path.read_text().splitlines() if line.strip() != target]
    path.write_text("\n".join(lines) + ("\n" if lines else ""))


def _expand_playlist(url: str) -> list[str]:
    """Expand a playlist URL into individual video URLs using yt-dlp flat playlist mode."""

    from yt_dlp import YoutubeDL

    if "list=" not in url:
        return [url]

    opts = {"quiet": True, "no_warnings": True, "extract_flat": True, "skip_download": True}
    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
    if not info:
        return []
    entries = info.get("entries") or []
    return [entry.get("url") or entry.get("webpage_url") for entry in entries if entry]


# --- processing per video ---------------------------------------------------


@dataclass
class ProcessOutcome:
    video_url: str
    book: BookRef
    book_dir: Path
    merged: bool
    dry_run: bool


def _resolve_book(book: BookRef, cache: ResolverCache | None) -> BookRef:
    """Double-check the parser's guess against Open Library, then Wikidata."""

    if book.confidence == Confidence.HIGH:
        return book

    with OpenLibraryResolver(cache=cache) as ol:  # pragma: no cover - network path
        refined = ol.lookup(book.author, book.title)
    if refined is not None:
        return refined

    with WikidataResolver(cache=cache) as wd:  # pragma: no cover - network path
        refined = wd.lookup(book.author, book.title)
    return refined or book


def _process_video(
    video_url: str,
    *,
    config: BeskarConfig,
    cache: ResolverCache | None,
    abs_client: ABSClient | None,
    abs_audiobook_root: Path | None,
    split_threshold_s: int,
    segment_length_s: int,
    dry_run: bool,
) -> ProcessOutcome | None:
    """Run the full fetch→parse→resolve→organize pipeline for a single video."""

    meta = yt.fetch_metadata(video_url)
    outcome = _parse_and_resolve(meta, cache=cache)
    book = outcome.book

    console.print(f"[cyan]Title :[/cyan] {book.title}")
    console.print(f"[cyan]Author:[/cyan] {book.author}")
    console.print(f"[cyan]Confidence:[/cyan] {book.confidence.value}")

    # Merge planning must happen before we pick the book dir.
    planner = MergePlanner(
        download_root=config.output_dir,
        abs_client=abs_client,
        abs_library_id=config.abs_library_id,
        abs_audiobook_root=abs_audiobook_root,
    )
    merge_plan = planner.plan(book, outcome.part_number)

    # Low-confidence downloads go to the review queue instead of the main tree.
    root = config.output_dir
    if book.confidence == Confidence.LOW:
        console.print(
            "[yellow]Low-confidence parse — routing to review queue.[/yellow]"
        )
        root = config.review_dir

    if dry_run:
        target = (
            merge_plan.target_book_dir
            if merge_plan is not None
            else root / book.author / book.title
        )
        console.print(f"[cyan]Target:[/cyan] {target}")
        return ProcessOutcome(
            video_url=video_url, book=book, book_dir=target, merged=bool(merge_plan), dry_run=True
        )

    workdir = root / book.author / book.title / "_download"
    workdir.mkdir(parents=True, exist_ok=True)

    downloaded = yt.download_audio(
        video_url,
        workdir,
        audio_format=config.audio_format,
        audio_quality=config.audio_quality,
    )
    duration = audio.probe_duration_seconds(downloaded)
    stem = downloaded.stem

    if duration > split_threshold_s:
        console.print(
            f"[cyan]Splitting {duration:.0f}s into {segment_length_s}s segments[/cyan]"
        )
        tracks = audio.split_by_length(
            downloaded,
            workdir,
            segment_seconds=segment_length_s,
            stem=stem,
            audio_format=config.audio_format,
        )
        downloaded.unlink(missing_ok=True)
    else:
        tracks = [downloaded]

    cover = _find_and_convert_cover(workdir)

    # Honor the merge plan: move into the existing book folder and renumber.
    if merge_plan is not None:
        target_root = merge_plan.target_author_dir.parent
        book_for_layout = book.with_(title=merge_plan.target_book_dir.name)
        result = write_book_layout(
            target_root,
            book_for_layout,
            tracks,
            cover_source=cover if merge_plan.existing_track_count == 0 else None,
            track_offset=merge_plan.track_offset,
        )
    else:
        result = write_book_layout(root, book, tracks, cover_source=cover)

    # Embed ID3 tags on every track for good measure.
    total = len(result.track_paths) + (merge_plan.track_offset if merge_plan else 0)
    for index, path in enumerate(result.track_paths, start=1):
        tag.write_track_tags(
            path,
            book,
            track_number=index + (merge_plan.track_offset if merge_plan else 0),
            total_tracks=total,
            cover_jpg=result.cover_path,
        )

    shutil.rmtree(workdir, ignore_errors=True)
    return ProcessOutcome(
        video_url=video_url,
        book=book,
        book_dir=result.book_dir,
        merged=bool(merge_plan),
        dry_run=False,
    )


def _parse_and_resolve(meta: VideoMetadata, *, cache: ResolverCache | None) -> ParseOutcome:
    outcome = parse(meta)
    refined = _resolve_book(outcome.book, cache)
    if refined is not outcome.book:
        outcome.book = refined
    return outcome


def _find_and_convert_cover(workdir: Path) -> Path | None:
    for candidate in workdir.iterdir():
        if candidate.suffix.lower() in {".webp", ".png", ".jpg", ".jpeg"}:
            if candidate.name == "cover.jpg":
                return candidate
            target = workdir / "cover.jpg"
            try:
                audio.convert_image(candidate, target)
                candidate.unlink(missing_ok=True)
                return target
            except audio.AudioToolError as exc:
                log.warning("cover conversion failed for %s: %s", candidate, exc)
                return candidate
    return None


# --- CLI --------------------------------------------------------------------


@click.command(help="Download YouTube audiobooks and organize them into the ABS layout.")
@click.argument("positional_links_file", type=click.Path(path_type=Path), required=False)
@click.option("--doctor", is_flag=True, help="Run preflight checks and exit.")
@click.option("--dry-run", is_flag=True, help="Fetch metadata and print the plan without downloading.")
@click.option("--links-file", type=click.Path(path_type=Path), help="Read YouTube URLs from PATH.")
@click.option("--output-dir", type=click.Path(path_type=Path), help="Override OUTPUT_DIR for this run.")
@click.option("--split-threshold", type=int, default=3600, help="Split files longer than N seconds.")
@click.option("--segment-length", type=int, default=1800, help="Use N seconds for fixed-length splits.")
@click.option("--limit", type=int, help="Process only the first N URLs.")
def main(
    positional_links_file: Path | None,
    doctor: bool,
    dry_run: bool,
    links_file: Path | None,
    output_dir: Path | None,
    split_threshold: int,
    segment_length: int,
    limit: int | None,
) -> int:
    logging.basicConfig(level=logging.WARNING, format="%(message)s")

    config = load_config()
    if links_file is not None:
        config = config.model_copy(update={"links_file": links_file})
    if positional_links_file is not None:
        config = config.model_copy(update={"links_file": positional_links_file})
    if output_dir is not None:
        config = config.model_copy(update={"output_dir": output_dir})

    report = preflight(config)
    for warning in report.warnings:
        console.print(f"[yellow]warn:[/yellow] {warning}")
    for error in report.errors:
        console.print(f"[red]error:[/red] {error}")
    if not report.ok:
        return 1

    urls = _iter_links(config.links_file, limit=limit)
    console.print(f"[bold]Links file:[/bold] {config.links_file}")
    console.print(f"[bold]Output dir:[/bold] {config.output_dir}")
    console.print(f"[bold]URLs:[/bold] {len(urls)}")
    if doctor:
        return 0
    if not urls:
        console.print("Nothing to download.")
        return 0

    cache = ResolverCache(config.cache_dir / "resolver.sqlite")
    abs_client = ABSClient.from_config(config)
    abs_audiobook_root = Path("/Volumes/mgomola/srv/docker/audiobookshelf/audiobooks")
    if not abs_audiobook_root.exists():
        abs_audiobook_root = None

    try:
        with Progress(
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TextColumn("{task.completed}/{task.total}"),
            TimeRemainingColumn(),
            console=console,
        ) as progress:
            # Expand playlist entries up-front so the progress total is correct.
            expanded: list[tuple[str, str]] = []
            for url in urls:
                for video_url in _expand_playlist(url):
                    if video_url:
                        expanded.append((url, video_url))

            task = progress.add_task("Downloading", total=len(expanded))
            completed_source_urls: set[str] = set()

            for source_url, video_url in expanded:
                progress.update(task, description=f"Fetching {video_url}")
                try:
                    outcome = _process_video(
                        video_url,
                        config=config,
                        cache=cache,
                        abs_client=abs_client,
                        abs_audiobook_root=abs_audiobook_root,
                        split_threshold_s=split_threshold,
                        segment_length_s=segment_length,
                        dry_run=dry_run,
                    )
                except Exception as exc:
                    console.print(f"[red]failed:[/red] {video_url}: {exc}")
                    progress.update(task, advance=1)
                    continue

                if outcome and outcome.merged:
                    console.print(f"[green]merged into existing book:[/green] {outcome.book_dir}")
                elif outcome:
                    console.print(f"[green]wrote:[/green] {outcome.book_dir}")

                completed_source_urls.add(source_url)
                progress.update(task, advance=1)

            if not dry_run:
                for source_url in completed_source_urls:
                    _remove_link(config.links_file, source_url)
    finally:
        cache.close()
        if abs_client is not None:
            abs_client.close()

    console.print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
