# beskar-shelf tools

Python package that powers the audiobookshelf-oriented tooling in this repo:

| Command | What it does |
|---|---|
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

This creates `tools/.venv`, installs `beskar_tools` in editable mode, and wires the shims to use that venv automatically.

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
    abs_client.py       # Audiobookshelf HTTP client
    organize/           # tested filesystem cleanup rules
    cli/                # one module per command binary
  tests/                # pytest checks
```

## Test

```bash
tools/.venv/bin/pytest tools/tests
```

YouTube-to-MP3 preparation is maintained in the shared
[`data-extraction`](../../data-extraction) repository.
