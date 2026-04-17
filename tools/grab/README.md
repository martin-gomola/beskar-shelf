# grab — YouTube to MP3 audiobook pipeline

Downloads YouTube audio, derives author/title metadata, splits by chapters or fixed length, and outputs Audiobookshelf-ready folder structures.

## Prerequisites

- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [ffmpeg](https://ffmpeg.org/)

```bash
brew install yt-dlp ffmpeg
```

## Setup

```bash
cp .env.example .env
cp links.txt.example links.txt
$EDITOR .env
$EDITOR links.txt
```

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `OUTPUT_DIR` | yes | `./downloads` | Where generated audiobook folders are written |
| `SPLIT_THRESHOLD` | no | `3600` | Split files longer than this many seconds |
| `SEGMENT_LENGTH` | no | `1800` | Segment size in seconds for fixed-length splitting |

Relative paths in `OUTPUT_DIR` are resolved against the repo root.

## Usage

```bash
./tools/grab/grab --doctor        # preflight checks
./tools/grab/grab --dry-run       # validate + print plan
./tools/grab/grab                 # download everything in links.txt
./tools/grab/grab --limit 1       # process only the first URL
./tools/grab/grab --links-file /path/to/urls.txt
```

Or via the repo Makefile from the project root:

```bash
make download
make download-dry-run
make doctor
```

## Download Behavior

For each valid URL in `links.txt`, grab:

- fetches video metadata and derives `Author/Title/`
- splits by YouTube chapters when available
- otherwise downloads a single MP3 and splits by fixed length when it exceeds `SPLIT_THRESHOLD`
- converts the thumbnail into `cover.jpg` for Audiobookshelf
- removes leftover source audio artifacts

Generated media lands in `OUTPUT_DIR/Author/Title/`. Point your Audiobookshelf library at that root and trigger a scan.
