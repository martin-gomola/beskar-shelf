# beskar-shelf

Forge YouTube audiobooks into beskar-grade MP3s, ready for your [Audiobookshelf](https://github.com/advplyr/audiobookshelf) vault. This is the Way.

## The Armoury

```
beskar-shelf/
├── bin/grab                  # The foundry — downloads & splits audio
├── infra/                    # Audiobookshelf deployment (Docker)
│   ├── docker-compose.yml
│   ├── .env.example
│   ├── bootstrap-email-settings.sh
│   └── README.md
├── .cursor/skills/
│   └── abs-library-manager/  # Agent skill for ABS metadata management
├── links.txt                 # Your bounty list (YouTube URLs)
├── downloads/                # The vault (downloaded audiobooks)
├── Makefile
└── .env                      # Clan secrets (not tracked)
```

## Prerequisites

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — the bounty hunter
- [ffmpeg](https://ffmpeg.org/) — the beskar smelter

```bash
brew install yt-dlp ffmpeg
```

## Setup

```bash
cp .env.example .env
cp links.txt.example links.txt
```

Edit `.env` — set `OUTPUT_DIR` and optionally `SPLIT_THRESHOLD`, `SEGMENT_LENGTH`, and Audiobookshelf API credentials.

## The Hunt

1. Add YouTube URLs to `links.txt` (one bounty per line):

```
https://www.youtube.com/watch?v=VIDEO_ID_1
https://youtu.be/VIDEO_ID_2
```

Lines starting with `#` are skipped.

2. Forge:

```bash
make download
```

Or bring your own bounty list:

```bash
./bin/grab my-targets.txt
```

MP3s land in `OUTPUT_DIR`, organized as `Author/Title/` — ready for Audiobookshelf to scan.

## What the Foundry Does

- Extracts author and title from the video name (regex parsing with channel name fallback)
- Splits by YouTube chapters when available
- Falls back to fixed-duration segments for long files (configurable via `SPLIT_THRESHOLD` / `SEGMENT_LENGTH`)
- Converts thumbnails to `cover.jpg` for Audiobookshelf
- Cleans up leftover artifacts

## Audiobookshelf Deployment

The `infra/` directory contains everything to run Audiobookshelf via Docker:

```bash
cd infra
cp .env.example .env
# Fill in your values
docker compose up -d
```

See `infra/README.md` for storage layout, reverse proxy notes, and email bootstrap.

## Library Management

The `abs-library-manager` agent skill (in `.cursor/skills/`) lets you manage your Audiobookshelf library via its REST API — fix titles, update authors, assign collections (genres), and organize series. Just ask your AI agent to handle it.

Requires `ABS_URL`, `ABS_TOKEN`, and `ABS_LIBRARY_ID` in `.env`.
