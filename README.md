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
├── tools/                   # beskar-tools Python package (grab, organize, …)
├── tools/grab/              # `grab` binary shim + per-project env + links
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
| `ABS_URL` | Optional Audiobookshelf base URL for local tooling and dev proxy |
| `ABS_TOKEN` | Optional API token for metadata management |
| `ABS_LIBRARY_ID` | Optional target library for metadata management |
| `IMAGE_NAME` | Docker image tag for app deployment |
| `CONTAINER_NAME` | Container name used by Docker Compose |
| `APP_PORT` | Host port exposed by the app container |
| `ABS_UPSTREAM` | Audiobookshelf base URL the app container proxies to |

### Get an API token

If you want to use repo tooling that expects `ABS_TOKEN`, you can obtain one
without opening the Audiobookshelf UI token screen:

```bash
make abs-token
```

The helper prompts for your Audiobookshelf URL, username, and password, then
prints the token so you can paste it into `.env`.

### Fill missing descriptions

Export books with empty Audiobookshelf descriptions into a JSON file you can
fill in and apply later:

```bash
make abs-descriptions
./tools/fill-abs-descriptions --apply descriptions.todo.json
```

The tool reads `ABS_URL` or `ABS_LOCAL_URL`, `ABS_TOKEN`, and `ABS_LIBRARY_ID`
from `.env`.

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

Python pipeline under `tools/beskar_tools/` (exposed as `beskar-grab` and the
`tools/grab/grab` shim). Details in `tools/README.md`.

```bash
make install-tools    # create tools/.venv + install beskar-tools
make doctor           # preflight checks
make download-dry-run # validate + print plan
make download         # forge the audiobooks
```

## Ebook Utilities

`tools/fix-ebooks` moves flat ebook files into per-book subdirectories so Audiobookshelf can scan them. Every PDF it moves is also linearised in place via `qpdf` so the in-app reader can stream the first page without downloading the whole file:

```bash
./tools/fix-ebooks /path/to/author-directory                  # move + linearise PDFs
./tools/fix-ebooks /path/to/author-directory --no-linearise   # move only
```

If `qpdf` isn't installed (`brew install qpdf` / `apt install qpdf`), `fix-ebooks` warns once and falls back to plain moves.

## Library Management

The `abs-library-manager` skill fixes titles, authors, collections, and series metadata through the Audiobookshelf API after a library scan.
