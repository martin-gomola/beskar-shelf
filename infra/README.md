# Audiobookshelf

Self-hosted audiobook and podcast server with multi-user playback sync. Requires WebSockets behind the reverse proxy.

## Setup

```bash
cp .env.example .env
nano .env
docker compose up -d
```

If you want to preload the email settings for "Send to E-Reader", fill the `ABS_EMAIL_*` and `ABS_ADMIN_*` values in `.env`, create the admin account in the web UI once, then run:

```bash
./bootstrap-email-settings.sh
```

## Access

- Web UI: `http://localhost:13378`
- First run: open the web UI and create the admin account

## Storage Layout

- `/audiobooks` -> `${DATA_DIR}/audiobookshelf/audiobooks`
- `/podcasts` -> `${DATA_DIR}/audiobookshelf/podcasts`
- `/metadata` -> `${DATA_DIR}/audiobookshelf/metadata`
- `/config` -> `${DATA_DIR}/audiobookshelf/config`

If you already keep your media somewhere else, change the host-side volume paths in `docker-compose.yml`.

## Reverse Proxy

- Recommended host: `ebooks.yourdomain.com`
- Enable WebSockets in Nginx Proxy Manager
- If you publish large uploads, raise the proxy body size limit

The upstream project explicitly documents WebSocket support as required for reverse proxies.

## Email Bootstrap

Audiobookshelf stores SMTP settings in its own database, not as native container env vars. This repo keeps the values in `.env` for convenience and uses `bootstrap-email-settings.sh` to push them through the API after your admin account exists.
