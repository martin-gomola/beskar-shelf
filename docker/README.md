# Audiobookshelf

Self-hosted audiobook and podcast server with multi-user playback sync. Reverse proxies must support WebSockets.

## Setup

```bash
cp .env.example .env
$EDITOR .env
docker compose up -d
```

Then open `http://localhost:13378` and create the admin account in the web UI.

## Access

- Web UI: `http://localhost:13378`
- Default API base URL for helper scripts: `http://localhost:13378`
- PWA UI after `docker compose up --build`: `http://localhost:4173`

## Storage Layout

- `/audiobooks` -> `${DATA_DIR}/audiobookshelf/audiobooks`
- `/ebooks` -> `${DATA_DIR}/audiobookshelf/ebooks`
- `/podcasts` -> `${DATA_DIR}/audiobookshelf/podcasts`
- `/metadata` -> `${DATA_DIR}/audiobookshelf/metadata`
- `/config` -> `${DATA_DIR}/audiobookshelf/config`

Point your `beskar-shelf` `OUTPUT_DIR` at the same host directory you want Audiobookshelf to scan for audiobooks, then trigger a library scan after new downloads are created.

## Reverse Proxy

- Recommended host: `ebooks.yourdomain.com`
- Enable WebSockets in Nginx Proxy Manager or your reverse proxy of choice
- Raise the body size limit if you expect large uploads
- For the custom PWA, same-origin hosting is the cleanest production setup:
  - serve Audiobookshelf on `https://ebooks.example.com`
  - serve the PWA on the same host or proxy it under a sibling path so API and media requests stay first-party
  - if you keep the PWA on a different origin, make sure your browser can reach Audiobookshelf API/media endpoints cross-origin

## Beskar Shelf PWA

The repo now includes a separate PWA client in `apps/pwa`. It is a custom mobile web app for browsing Audiobookshelf libraries, starting playback sessions, reading EPUB/PDF items, syncing progress, and downloading audiobooks for offline listening.

### Local Development

```bash
make pwa-install
make pwa-dev
```

The dev server reads `ABS_URL` from the repo root `.env` and mounts a local `/abs` proxy to avoid browser CORS failures against a remote Audiobookshelf host.

### Validation

```bash
make pwa-test
make pwa-build
```

### Docker

`docker compose up --build` now starts both:

- `audiobookshelf` on `http://localhost:13378`
- `beskar-shelf-pwa` on `http://localhost:4173`

The PWA still expects you to enter the Audiobookshelf server URL on first launch unless you bake a default server URL into the frontend env at build time.

## Email Bootstrap

Audiobookshelf stores SMTP settings in its own database, not as native container environment variables. This repo keeps those values in `.env` and provides `bootstrap-email-settings.sh` to push them through the API.

Run the bootstrap only after:

1. `docker compose up -d` is complete
2. the admin account already exists in the web UI
3. `ABS_BASE_URL` is reachable from the machine running the script

When those conditions are met:

```bash
./bootstrap-email-settings.sh
```
