# beskar-shelf tools

Python package that powers the audiobookshelf-oriented tooling in this repo:

| Command | What it does |
|---|---|
| `./tools/grab/grab` | Fetch YouTube audiobooks with `yt-dlp`, split with `ffmpeg`, tag with `mutagen`, organize into `Author/Title/` |
| `./tools/abs-organize` | Normalize existing download trees into Audiobookshelf layout (data-driven rules) |
| `./tools/fill-abs-descriptions` | List/export/apply missing ABS descriptions |
| `./tools/fix-ebooks` | Move flat ebooks into per-book subdirectories (auto-linearises PDFs via qpdf; `--no-linearise` to skip) |
| `./tools/get-abs-token` | Interactive token fetch against ABS `/login` |
| `./tools/optimize-pdf` | Shrink + linearise a book PDF (pymupdf + qpdf) |

All commands are thin shebang shims around the `beskar_tools` Python package.

## Install

One-time setup per machine:

```bash
make install-tools
```

This creates `tools/.venv`, installs `beskar_tools` in editable mode with pinned deps, and wires the shims to use that venv automatically.

`optimize-pdf` additionally needs the `qpdf` binary on PATH:

```bash
brew install qpdf       # macOS
sudo apt install qpdf   # Debian/Ubuntu
```

If you prefer managing the environment yourself:

```bash
python3 -m venv tools/.venv
tools/.venv/bin/pip install -e tools[dev]
```

## Layout

```
tools/
  pyproject.toml
  beskar_tools/
    config.py           # .env loader, BeskarConfig pydantic model
    models.py           # BookRef, MergePlan, ResolveResult
    yt.py               # yt-dlp wrapper (metadata + download)
    audio.py            # ffmpeg/ffprobe wrappers
    tag.py              # ID3 tagging via mutagen
    abs_client.py       # Audiobookshelf HTTP client
    normalize/          # heuristic parser + rule engine
    resolve/            # Open Library + Wikidata lookups with sqlite cache
    organize/           # layout writer + multi-part merge detector
    cli/                # one module per command binary
  tests/                # pytest + pytest-httpx offline fixtures
```

## Test

```bash
tools/.venv/bin/pytest tools/tests
```

## Design notes

* Parsing is **heuristic first, knowledge-base second**. No LLM.
* Failure cases are captured as pytest fixtures so regressions are caught immediately.
* Multi-part books are detected by comparing parsed title against the ABS library; matches trigger renumber-and-merge instead of a duplicate folder.
* All external calls (yt-dlp metadata, Open Library, Wikidata, ABS) are mockable for offline tests.
