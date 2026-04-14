# beskar-shelf

A PWA forged from pure beskar for your [Audiobookshelf](https://github.com/advplyr/audiobookshelf) armory. Browse libraries, play audiobooks, read ebooks, sync progress, stash content offline. This is the Way.

## The Armory

- Login and server onboarding
- Library browsing with home shelves
- Chapter list, resume state, item detail
- Player with rate control, seek, queue, progress sync
- EPUB/PDF reader via the Audiobookshelf ebook endpoint
- Offline downloads stored in IndexedDB

## Layout

```text
beskar-shelf/
├── src/                     # React + TypeScript source
├── public/                  # Icons, favicon
├── index.html
├── package.json
├── vite.config.ts           # Vite + PWA + proxy
├── Dockerfile               # Multi-stage build → nginx
├── nginx.conf               # PWA container nginx template
├── tools/grab/              # YouTube → MP3 pipeline (self-contained)
├── tools/fix-ebooks         # Reorganize ebook folders for ABS
├── Makefile
└── .env.example
```

## Quick Start

```bash
make install
make dev
```

## Configuration

Copy `.env.example` to `.env`:

| Variable | Purpose |
|---|---|
| `VITE_APP_NAME` | Display name |
| `VITE_DEFAULT_SERVER_URL` | Pre-filled server URL on first launch |
| `VITE_ABS_PROXY_BASE` | Dev proxy prefix (default `/abs`) |
| `ABS_URL` | Audiobookshelf server URL, doubles as dev proxy target |
| `ABS_TOKEN` | API token for metadata management |
| `ABS_LIBRARY_ID` | Target library for metadata management |

## Development

```bash
make install    # dependencies
make dev        # Vite dev server + ABS proxy
make lint       # linter
make test       # tests
make build      # production bundle
```

`make dev` proxies browser requests to `ABS_URL` under `/abs`, sidestepping CORS when your Audiobookshelf server sits on a different origin.

## Deploy

This repo now owns the Beskar Shelf app only. Manage the Audiobookshelf
server itself in your infrastructure repo, then point the app container at it
through `ABS_UPSTREAM`.

```bash
cp .env.example .env
$EDITOR .env
docker compose up -d --build
```

The container serves the PWA on `http://localhost:4173` and proxies `/abs/*`
to `ABS_UPSTREAM`, so the app can stay same-origin without bundling the
Audiobookshelf server into this repo.

If you prefer Make targets, `make deploy`, `make deploy-down`, and `make deploy-logs`
now wrap the same Compose commands.

## Grab: YouTube → MP3

Self-contained pipeline in `tools/grab/`. Details in `tools/grab/README.md`.

```bash
make doctor           # preflight checks
make download-dry-run # validate + print plan
make download         # forge the audiobooks
```

## Ebook Utilities

`tools/fix-ebooks` moves flat ebook files into per-book subdirectories so Audiobookshelf can scan them:

```bash
./tools/fix-ebooks /path/to/author-directory
```

## Library Management

The `abs-library-manager` skill fixes titles, authors, collections, and series metadata through the Audiobookshelf API after a library scan.
