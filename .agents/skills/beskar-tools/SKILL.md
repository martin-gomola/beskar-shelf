---
name: beskar-tools
description: >-
  Use the beskar-tools Python package under tools/ for local Audiobookshelf
  library maintenance in this repo: normalizing existing media folders,
  fixing ebook folders, filling missing ABS descriptions, fetching an ABS API
  token, and shrinking/linearising book PDFs. Use when the user asks to
  organize existing audiobook or ebook files, prep ebooks for ABS, backfill
  descriptions, obtain an ABS token, or compress a book PDF. Media
  acquisition, including YouTube downloads, is out of scope for this repo.
---

# beskar-tools

Python package at `tools/beskar_tools/` that powers every CLI under `tools/`.
The shell files in `tools/` (`abs-organize`, `fix-ebooks`,
`fill-abs-descriptions`, `get-abs-token`, `optimize-pdf`) are thin shims that
`exec` into `tools/.venv/bin/python -m beskar_tools.cli.<name>`.

These tools operate on media already present in the repository's downloads
tree; they do not acquire books from YouTube or other sources. Prefer the
shims over ad-hoc scripts so filesystem and ABS operations follow the repo's
conventions.

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
| Clean up an existing `downloads/` tree into ABS shape | `tools/abs-organize` |
| Flat ebook files need per-book subfolders | `tools/fix-ebooks` |
| Find/backfill books missing ABS descriptions | `tools/fill-abs-descriptions` |
| Produce an `ABS_TOKEN` from username/password | `tools/get-abs-token` |
| Shrink/linearise a book PDF for ABS reader | `tools/optimize-pdf` |
| Metadata updates, collections, series via ABS REST | use the `abs-library-manager` skill |

Rule of thumb: **filesystem work → beskar-tools; REST metadata work →
abs-library-manager**. Both can be chained (e.g. organize files, then trigger
an ABS library scan via the ABS API).

## Configuration

`beskar_tools.config.load_config()` loads `.env` from the repo root. Known
keys:

| Key | Used by | Notes |
|---|---|---|
| `ABS_URL` | get-abs-token, fill-descriptions | Public URL |
| `ABS_LOCAL_URL` | fill-descriptions | LAN override; preferred for API work |
| `ABS_TOKEN` | fill-descriptions | Bearer token |
| `ABS_LIBRARY_ID` | fill-descriptions | Target library |
| `ABS_USERNAME` | get-abs-token | Prompt default |

The effective URL for API calls is `ABS_LOCAL_URL or ABS_URL`. Never commit
local/LAN URLs to tracked files.

## Commands

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
  abs_client.py     ABS HTTP client (login, items, media PATCH)
  organize/         tested layout cleanup rules
  cli/              one module per CLI binary
tools/tests/        pytest + pytest-httpx offline fixtures
```

Tests are offline-only — ABS calls are mockable and filesystem operations use
temporary test fixtures. When touching cleanup, ebook, description, or PDF
logic, add or update a fixture under `tools/tests/` before shipping the fix.

## Common workflows

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
- `.env` files are gitignored — never stage them, even during troubleshooting.
- Ruff config ignores Unicode ambiguity warnings (`RUF001`–`003`) on purpose;
  the library routinely contains en-dashes and diacritics.
- Never hardcode LAN IPs, hostnames, or tokens into tracked files; use
  `.env` / `ABS_LOCAL_URL` overrides.
