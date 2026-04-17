---
name: abs-library-manager
description: >-
  Manage Audiobookshelf library metadata for this repo via ABS_URL and
  ABS_TOKEN from .env. Use for collections, series, title cleanup, and
  author fixes without hardcoding host-specific endpoints.
---

# ABS Library Manager

Repo-local guidance for managing Audiobookshelf metadata from `beskar-shelf`.

## Source Of Truth

Always load connection details from the repo `.env` file:

```bash
ABS_URL
ABS_TOKEN
ABS_LIBRARY_ID
```

Do not hardcode LAN IPs, machine-local hostnames, or private infrastructure
addresses into scripts, docs, prompts, or skills.

## Connection Rules

- Prefer the user-managed `ABS_URL` in `.env`.
- Treat `ABS_URL` as the only repo-approved endpoint for API work.
- If the public host is blocked by edge protection for direct API calls,
  use a local, untracked runtime override instead of changing tracked files.
- Preferred override order:
  1. `ABS_LOCAL_URL` from local `.env`
  2. a one-off shell override like `ABS_URL=http://<local-host>:13378 ...`
  3. browser-context requests when only browser-origin traffic is allowed
- Never commit `ABS_LOCAL_URL`, LAN IPs, or private hostnames to tracked repo
  files, prompts, or docs.
- When both are present, use:

```bash
ABS_EFFECTIVE_URL="${ABS_LOCAL_URL:-$ABS_URL}"
```

and make requests against `ABS_EFFECTIVE_URL`.

## Supported Tasks

- create or rename collections
- assign books to collections
- create or fix series and sequence numbers
- clean titles or authors
- export and apply missing descriptions
- trigger a library scan after metadata changes

## API Patterns

Use `Authorization: Bearer $ABS_TOKEN` for all calls.

Recommended shell prelude:

```bash
ABS_EFFECTIVE_URL="${ABS_LOCAL_URL:-$ABS_URL}"
```

### List items

```bash
curl -sS \
  -H "Authorization: Bearer $ABS_TOKEN" \
  "$ABS_EFFECTIVE_URL/api/libraries/$ABS_LIBRARY_ID/items?limit=100&minified=0&collapseseries=0"
```

### Update item metadata

```bash
curl -sS \
  -X PATCH \
  -H "Authorization: Bearer $ABS_TOKEN" \
  -H "Content-Type: application/json" \
  "$ABS_EFFECTIVE_URL/api/items/$ITEM_ID/media" \
  --data '{"metadata":{"series":[{"name":"Series Name","sequence":"1"}]}}'
```

### Create collection

```bash
curl -sS \
  -X POST \
  -H "Authorization: Bearer $ABS_TOKEN" \
  -H "Content-Type: application/json" \
  "$ABS_EFFECTIVE_URL/api/collections" \
  --data '{"libraryId":"'"$ABS_LIBRARY_ID"'","name":"Collection Name","books":["'"$ITEM_ID"'"]}'
```

## Workflow

1. Read the target library inventory first.
2. Read existing collections and series before creating new ones.
3. Apply only obvious, high-confidence metadata updates unless the user asks
   for broader curation.
4. Verify the updated items after each batch.
5. Trigger a scan only if the user-facing result depends on it.

### Fill missing descriptions

Use the bundled repo tool instead of ad hoc one-off commands:

```bash
./tools/fill-abs-descriptions --list-missing
./tools/fill-abs-descriptions --export-missing descriptions.todo.json
./tools/fill-abs-descriptions --apply descriptions.todo.json
```

Recommended process:

1. Export missing descriptions to JSON.
2. Fill only the `description` fields in that file.
3. Apply the file back through the ABS API.
4. Re-run `--list-missing` to verify what remains.

## Gotchas

- `series.sequence` must be a string.
- `authorName` from list endpoints is read-only; updates should use the
  `authors` array.
- `coverPath` is not a stable public API contract for repo tooling.
- Keep secrets in `.env`, never in committed scripts.
