---
name: abs-library-manager
description: >-
  Manage Audiobookshelf library metadata via REST API: fix book titles and
  authors, assign books to genre collections, and set series with sequence
  numbers. Use when the user asks to update book names, fix metadata, create
  or edit collections, assign genres, create series, or organize the
  Audiobookshelf library. Triggers on: audiobookshelf, ABS, collections,
  series, book metadata, fix titles, genres, library management.
---

# Audiobookshelf Library Manager

Manage book metadata, collections, and series via the Audiobookshelf REST API.

## Configuration

Load credentials from the project `.env` file:

```
ABS_URL        – base URL (e.g. https://host/audiobookshelf)
ABS_TOKEN      – API bearer token
ABS_LIBRARY_ID – target library UUID
```

All API calls require `Authorization: Bearer $ABS_TOKEN` header.
Mutation requests also require `Content-Type: application/json`.

## API Endpoints

### Library Items

**List items:**
```
GET /api/libraries/$ABS_LIBRARY_ID/items?limit=100
```
Response: `{results: [{id, media: {metadata: {title, authorName, series, genres}}}]}`
Note: `authorName` is a flat string in list view; `authors` array only in detail view.

**Get item detail:**
```
GET /api/items/$ITEM_ID
```
Returns full `media.metadata.authors` as `[{id, name}]` and `series` as `[{id, name, sequence}]`.

**Update metadata:**
```
PATCH /api/items/$ITEM_ID/media
```
Response wraps in `{"libraryItem": {...}}` — parse accordingly.

Update title:
```json
{"metadata": {"title": "New Title"}}
```

Update authors (must use `authors` array, not `authorName`):
```json
{"metadata": {"authors": [{"name": "Author Name"}]}}
```

Update series (`sequence` is a string):
```json
{"metadata": {"series": [{"name": "Series Name", "sequence": "1"}]}}
```

Update genres:
```json
{"metadata": {"genres": ["Fantasy a sci-fi"]}}
```

**Batch update items:**
```
POST /api/items/batch/update
```

**Search library:**
```
GET /api/libraries/$ABS_LIBRARY_ID/search?q=QUERY
```

**Trigger library scan:**
```
POST /api/libraries/$ABS_LIBRARY_ID/scan
```

### Collections

**List all:**
```
GET /api/collections
```
Response: `{collections: [{id, name, books: [...]}]}`

**Create:**
```
POST /api/collections
{"libraryId": "$ABS_LIBRARY_ID", "name": "Name", "books": ["item-id-1"]}
```
Requires at least one valid book ID.

**Update (rename, reorder):**
```
PATCH /api/collections/$COLLECTION_ID
{"name": "New Name", "description": "optional"}
```

**Delete:**
```
DELETE /api/collections/$COLLECTION_ID
```

**Add single book:**
```
POST /api/collections/$COLLECTION_ID/book
{"id": "library-item-id"}
```

**Remove single book:**
```
DELETE /api/collections/$COLLECTION_ID/book/$LIBRARY_ITEM_ID
```

**Batch add books:**
```
POST /api/collections/$COLLECTION_ID/batch/add
{"books": ["item-id-1", "item-id-2"]}
```

**Batch remove books:**
```
POST /api/collections/$COLLECTION_ID/batch/remove
{"books": ["item-id-1", "item-id-2"]}
```

### Authors

**Get author:**
```
GET /api/authors/$AUTHOR_ID
```

**Update author:**
```
PATCH /api/authors/$AUTHOR_ID
{"name": "New Name"}
```

**Match author (fetch metadata from providers):**
```
POST /api/authors/$AUTHOR_ID/match
```

**List library authors:**
```
GET /api/libraries/$ABS_LIBRARY_ID/authors
```

### Series

**Get series:**
```
GET /api/series/$SERIES_ID
```

**Update series:**
```
PATCH /api/series/$SERIES_ID
{"name": "New Name"}
```

**List library series:**
```
GET /api/libraries/$ABS_LIBRARY_ID/series
```

### Genres

**List all genres:**
```
GET /api/genres
```

**Rename genre:**
```
POST /api/genres/rename
{"genre": "Old Name", "newGenre": "New Name"}
```

**Delete genre:**
```
DELETE /api/genres/$GENRE_NAME
```

## Workflows

### Fix book titles and authors

1. List all items to see current state.
2. Identify wrong titles (missing diacritics, noise, swapped author/title).
3. PATCH each item with corrected `title` and/or `authors` array.
4. Verify by listing items again.

### Assign books to genre collections

1. List items and existing collections.
2. For unknown genres, look up the book on [audioteka.com/sk](https://audioteka.com/sk/) to find its category.
3. Create missing collections with book IDs. Use batch add for multiple books.
4. Remove books from wrong collections if needed.

### Assign series

1. Identify books that belong to a series (search web if unsure).
2. PATCH each item's metadata with `series` array including `name` and `sequence`.
3. Verify by listing items and checking series field.

## Gotchas

- List endpoint returns `authorName` (flat string); detail returns `authors` (array). Use array for updates.
- PATCH `/items/:id/media` response wraps in `{"libraryItem": {...}}`.
- Series `sequence` is a string, not a number.
- Collection create requires at least one valid book ID in `books` array.
- When looking up genres, prefer [audioteka.com/sk](https://audioteka.com/sk/) categories.
