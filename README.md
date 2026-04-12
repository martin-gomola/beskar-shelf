# YT Grabber

Download YouTube videos as MP3 files.

## Prerequisites

- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [ffmpeg](https://ffmpeg.org/)

Install on macOS:

```bash
brew install yt-dlp ffmpeg
```

## Setup

Copy the example env file and set your output directory:

```bash
cp .env.example .env
```

Edit `.env` to set your audiobook output path.

## Usage

1. Add YouTube URLs to `links.txt` (one per line):

```
https://www.youtube.com/watch?v=VIDEO_ID_1
https://youtu.be/VIDEO_ID_2
```

Lines starting with `#` are ignored.

2. Run:

```bash
make download
```

MP3 files are saved to the `OUTPUT_DIR` configured in `.env`, organized as `Author/Title/` for Audiobookshelf compatibility.

## Custom links file

```bash
./download-mp3.sh my-links.txt
```
