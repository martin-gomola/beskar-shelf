# beskar-shelf

Forge YouTube audiobooks into beskar-grade MP3s, run your [Audiobookshelf](https://github.com/advplyr/audiobookshelf) server, and ship a custom listening client on top. This is the Way.

## Project Layout

```text
beskar-shelf/
├── bin/grab                  # The foundry: validates inputs, fetches metadata, downloads audio
├── bin/fix-ebooks            # Reorganizes ebook files into per-book folders
├── apps/pwa/                 # Beskar Shelf PWA client for playback and offline listening
├── docker/                   # Audiobookshelf deployment files
├── links.txt                 # YouTube URLs, one per line
├── downloads/                # Default output location from .env.example
├── Makefile
└── .env                      # Local settings, not tracked
```

## Prerequisites

- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [ffmpeg](https://ffmpeg.org/)

```bash
brew install yt-dlp ffmpeg
```

## Happy Path

```bash
make setup
$EDITOR .env
$EDITOR links.txt
make doctor
make download
```

`make setup` only creates missing files, so it is safe to rerun.

## Configuration

Start from `.env.example`:

```bash
cp .env.example .env
cp links.txt.example links.txt
```

Required:

- `OUTPUT_DIR`: where generated audiobook folders will be written

Optional:

- `SPLIT_THRESHOLD`: split files longer than this many seconds
- `SEGMENT_LENGTH`: segment size in seconds when fixed-length splitting is needed
- `ABS_URL`, `ABS_TOKEN`, `ABS_LIBRARY_ID`: used by the separate Audiobookshelf metadata-management skill

Relative paths in `OUTPUT_DIR` are resolved against the repo root.

## Commands

```bash
make help
make setup
make doctor
make download
make download-dry-run
make pwa-install
make pwa-dev
make pwa-build
make pwa-test
```

You can also call the script directly:

```bash
./bin/grab --help
./bin/grab --dry-run
./bin/grab --links-file my-targets.txt --limit 1
```

CLI flag precedence is:

1. command-line flags
2. `.env`
3. built-in defaults

## Download Behavior

For each valid URL in `links.txt`, `bin/grab`:

- fetches video metadata and derives `Author/Title/`
- splits by YouTube chapters when available
- otherwise downloads a single MP3 and splits it by fixed length only when it exceeds `SPLIT_THRESHOLD`
- converts the downloaded thumbnail into `cover.jpg` for Audiobookshelf
- removes leftover source audio artifacts

`make download-dry-run` performs the same validation and metadata fetch, then prints the planned target folder and split mode without writing files.

Generated media lands in `OUTPUT_DIR/Author/Title/`. Point your Audiobookshelf library at that root and trigger a library scan after new downloads complete.

## Audiobookshelf Deployment

The `docker/README.md` guide covers Docker setup, storage layout, reverse proxy requirements, and the optional email bootstrap helper.

## Beskar Shelf PWA

The repo now includes a standalone frontend app in `apps/pwa` for a mobile-first Audiobookshelf experience.

Current scope:

- server URL onboarding and username/password login
- home shelves and library browsing
- item detail with chapter list and resume state
- global player with rate control, seek, queue, and progress sync
- EPUB/PDF reader route backed by the Audiobookshelf ebook endpoint
- explicit offline downloads backed by IndexedDB

Run it locally:

```bash
make pwa-install
make pwa-dev
```

`make pwa-dev` sources the repo `.env` and proxies browser API/media requests to `ABS_URL` under `/abs` so local development can work even when your Audiobookshelf server does not allow cross-origin browser access.

Validate it:

```bash
make pwa-test
make pwa-build
```

The app now supports both listening and reading. Audiobook playback, ebook reading, and progress sync all run against the same Audiobookshelf account and server.

## Library Management

The included `abs-library-manager` skill can fix titles, authors, collections, and series metadata through the Audiobookshelf API after your library has been scanned.
