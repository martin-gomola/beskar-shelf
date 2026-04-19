---
name: beskar-tools
description: >-
  Use the beskar-tools Python package under tools/ for all local audiobook
  pipeline work in this repo: downloading from YouTube, normalizing folder
  layout for Audiobookshelf, fixing ebook folders, filling missing ABS
  descriptions, fetching an ABS API token, and shrinking/linearising book
  PDFs for streaming + offline reading. Use when the user asks to
  grab/download audiobooks, organize or clean the downloads tree, merge
  multi-part books, prep ebooks for ABS, backfill descriptions, obtain an
  ABS token, or compress a book PDF.
---

# beskar-tools

Python package at `tools/beskar_tools/` that powers every CLI under `tools/`.
The shell files in `tools/` (`grab/grab`, `abs-organize`, `fix-ebooks`,
`fill-abs-descriptions`, `get-abs-token`, `optimize-pdf`) are thin shims
that `exec` into `tools/.venv/bin/python -m beskar_tools.cli.<name>`.

Prefer these shims over hand-rolled `curl`/`yt-dlp`/`ffmpeg` invocations.

## Bootstrap

One-time setup per machine:

```bash
make install-tools
```

Creates `tools/.venv`, installs `beskar-tools` editable with pinned deps, and
makes every `tools/` shim work. If a shim errors with "beskar-tools is not
installed yet," this is the fix.

Other dev targets:

```bash
make tools-test   # pytest tests/ inside tools/.venv
make tools-lint   # ruff check beskar_tools tests
```

## Picking the right tool

| User intent | Tool |
|---|---|
| Download YouTube links into Author/Title/ layout | `tools/grab/grab` |
| Clean up an existing `downloads/` tree into ABS shape | `tools/abs-organize` |
| Flat ebook files need per-book subfolders | `tools/fix-ebooks` |
| Find/backfill books missing ABS descriptions | `tools/fill-abs-descriptions` |
| Produce an `ABS_TOKEN` from username/password | `tools/get-abs-token` |
| Shrink/linearise a book PDF for ABS reader | `tools/optimize-pdf` |
| Metadata updates, collections, series via ABS REST | use the `abs-library-manager` skill |

Rule of thumb: **filesystem work → beskar-tools; REST metadata work →
abs-library-manager**. Both can be chained (e.g. `grab` then library scan via
ABS API).

## Configuration

`beskar_tools.config.load_config()` merges `.env` (repo root) and
`tools/grab/.env`, with repo-root winning on conflicts. Known keys:

| Key | Used by | Notes |
|---|---|---|
| `ABS_URL` | all ABS tools | Public URL |
| `ABS_LOCAL_URL` | all ABS tools | LAN override; preferred for API work |
| `ABS_TOKEN` | fill-descriptions, grab merge detection | Bearer token |
| `ABS_LIBRARY_ID` | abs-organize, fill-descriptions | Target library |
| `ABS_USERNAME` | get-abs-token | Prompt default |
| `OUTPUT_DIR` | grab, abs-organize | Default: `./downloads` |
| `LINKS_FILE` | grab | Default: `tools/grab/links.txt` |
| `REVIEW_DIR` | grab | Low-confidence downloads land here |
| `SPLIT_HOURS` / `MIN_SPLIT_HOURS` | grab | Long-file chunking |

The effective URL for API calls is `ABS_LOCAL_URL or ABS_URL`. Never commit
local/LAN URLs to tracked files.

## Commands

### grab — YouTube → Author/Title/

```bash
tools/grab/grab --doctor                # preflight checks
tools/grab/grab --dry-run               # fetch metadata, print plan, no I/O
tools/grab/grab                         # process all links.txt
tools/grab/grab --limit 1               # process only first URL
tools/grab/grab --links-file path.txt
tools/grab/grab --output-dir /other     # override OUTPUT_DIR
tools/grab/grab --split-threshold 3600 --segment-length 1800
```

Behavior:

- Parses title → BookRef heuristically; low confidence drops into `REVIEW_DIR`.
- Splits by YouTube chapters when present; otherwise fixed-length splits if the
  file exceeds `split-threshold`.
- Writes ID3 tags with `mutagen`, saves `cover.jpg`, and on successful handling
  removes the URL from `links.txt` so the queue stays clean.
- If `ABS_URL` + `ABS_TOKEN` are set, matches the parsed title against the live
  library and **merges multi-part books** into the existing folder instead of
  creating a duplicate.

Makefile aliases: `make download`, `make download-dry-run`, `make doctor`.

### abs-organize — normalize existing downloads

```bash
tools/abs-organize --dry-run            # preview moves
tools/abs-organize                      # apply moves under ./downloads
tools/abs-organize /custom/downloads --dry-run
```

Rule-driven, idempotent reorganization of an existing tree into
`Author/Title/`. Always run `--dry-run` first and diff the planned moves
before applying.

### fix-ebooks — one author folder at a time

```bash
tools/fix-ebooks /path/to/Author                    # move + auto-linearise PDFs
tools/fix-ebooks /path/to/Author --no-linearise     # move only, leave PDFs alone
```

Moves every top-level file under `Author/` into `Author/<stem>/<file>`.

After each move, every `.pdf` is also linearised in place via
`qpdf --linearize --object-streams=generate --replace-input`. That's the
streaming win: a linearised PDF lets the in-app `pdfjs-dist` reader render
page 1 without downloading the whole file (HTTP Range requests). EPUB / MOBI
/ TXT files are moved as-is.

If `qpdf` isn't on PATH, `fix-ebooks` prints a single warning and continues
moving files - the `--no-linearise` path is the same code path with the qpdf
call elided. Per-file qpdf failures (damaged PDFs) are also non-fatal: the
move still succeeds and the failure is reported next to the move line.

Run once per author directory that still has flat files, then trigger an ABS
scan.

### fill-abs-descriptions — missing ABS descriptions

```bash
tools/fill-abs-descriptions --list-missing
tools/fill-abs-descriptions --export-missing descriptions.todo.json
# edit the description fields in the JSON, then:
tools/fill-abs-descriptions --apply descriptions.todo.json
```

Use JSON-export then apply for any nontrivial batch so the edit is reviewable.
Requires `ABS_TOKEN` and `ABS_LIBRARY_ID`.

### get-abs-token — bootstrap ABS_TOKEN

```bash
tools/get-abs-token                          # uses ABS_URL/ABS_USERNAME from .env
tools/get-abs-token --url https://abs.example.com --username alice
```

Password is read with `getpass` (never echoed, never logged). Paste the
resulting token into `.env` as `ABS_TOKEN=…`; never into a tracked file.

### optimize-pdf — shrink + linearise a book PDF

```bash
tools/optimize-pdf path/to/book.pdf                       # default lossy q=85
tools/optimize-pdf path/to/book.pdf --quality 90          # higher fidelity
tools/optimize-pdf path/to/book.pdf --lossless            # qpdf-only, visually identical
tools/optimize-pdf path/to/book.pdf --output out.pdf      # explicit destination
```

Modes:

- **lossy (default)**: pymupdf re-encodes raster images as JPEG `quality=N`,
  subsets fonts, drops unused objects, then qpdf linearises. Typical 60-90%
  smaller for image-heavy PDFs. Skips images <50 KB and any re-encode that
  doesn't shave at least 10% (JPEG header overhead would otherwise grow
  small images).
- **--lossless**: qpdf-only object-stream pack + linearise. Visually
  identical to source. Modest size win (~5-15%) but linearisation lets the
  ABS reader render page 1 without downloading the whole file.

Output defaults to `<stem>.opt.pdf` next to the source. Each unique image
xref is re-encoded once even if used on multiple pages. Exotic colourspaces
(CMYK, DeviceN, image masks) are left untouched.

Requires `qpdf` on PATH (`brew install qpdf` on macOS) and `pymupdf` in the
tools venv (already pinned in `pyproject.toml`).

Makefile aliases:

```bash
make optimize-pdf PDF=book.pdf [QUALITY=85] [OUT=out.pdf]
make optimize-pdf-lossless PDF=book.pdf [OUT=out.pdf]
```

## Package layout (for debugging / extension)

```
tools/beskar_tools/
  config.py         .env loader + BeskarConfig pydantic model
  models.py         BookRef, MergePlan, Confidence, VideoMetadata
  yt.py             yt-dlp wrapper (metadata + download)
  audio.py          ffmpeg / ffprobe wrappers
  tag.py            ID3 tagging via mutagen
  abs_client.py     ABS HTTP client (login, items, media PATCH)
  normalize/        heuristic title parser + rule engine
  resolve/          Open Library + Wikidata fallback, sqlite cache
  organize/         layout writer + multi-part merge planner
  cli/              one module per CLI binary
tools/tests/        pytest + pytest-httpx offline fixtures
```

Tests are offline-only — every external call (yt-dlp, Open Library, Wikidata,
ABS) is mockable. When touching parser/merge/resolver logic, add a fixture
under `tools/tests/` before shipping the fix.

## Common workflows

**New batch of YouTube URLs**

1. Append URLs to `tools/grab/links.txt` (gitignored).
2. `tools/grab/grab --doctor` → fix any preflight failure.
3. `tools/grab/grab --dry-run` → review parsed Author/Title for each URL.
4. `tools/grab/grab` → download.
5. Anything in `downloads/_review/` needs manual inspection before import.
6. Trigger ABS scan (via `abs-library-manager` skill).

**Existing tree needs cleanup**

1. `tools/abs-organize --dry-run`
2. Inspect the planned moves; if a rule is wrong, fix it in
   `beskar_tools/organize/cleanup_rules.py` and add a test.
3. `tools/abs-organize` to apply.

**Missing descriptions**

1. `tools/fill-abs-descriptions --list-missing` to gauge scope.
2. `--export-missing descriptions.todo.json`, edit offline, `--apply`.

## Gotchas

- The shims require `tools/.venv`. CI and fresh clones must run
  `make install-tools` first.
- `optimize-pdf` additionally needs `qpdf` on PATH. macOS:
  `brew install qpdf`; Debian/Ubuntu: `apt install qpdf`.
- `links.txt` and `.env` files are gitignored — never stage them, even during
  troubleshooting.
- `grab` mutates `links.txt` on success; run `--dry-run` first if you need to
  keep the queue intact.
- Multi-part merge only kicks in when both `ABS_URL` and `ABS_TOKEN` are set.
  Without them, grab falls back to a fresh folder per URL.
- Ruff config ignores Unicode ambiguity warnings (`RUF001`–`003`) on purpose;
  YouTube titles routinely contain en-dashes and diacritics.
- Never hardcode LAN IPs, hostnames, or tokens into tracked files; use
  `.env` / `ABS_LOCAL_URL` overrides.
