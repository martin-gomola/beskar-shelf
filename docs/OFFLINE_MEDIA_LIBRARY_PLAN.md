# Reusable PWA Offline Media Library Plan

- Status: Proposed
- Scope: repository-local workspace package, reusable by Beskar Shelf and another PWA
- Proposed package: `@mgomola/pwa-offline-media`

## Decision

Extract Beskar Shelf's generic download, cancellation, durable transfer state,
IndexedDB binary storage, and small namespaced key-value behavior into a
framework-agnostic package under `packages/pwa-offline-media/`.

Keep the package in this repository until a second production consumer proves
that independent release cadence or repository ownership is useful. The second
PWA may initially consume a packed workspace artifact; registry publishing is a
later distribution decision, not a prerequisite for extraction.

Do not move Audiobookshelf models, authentication, playback orchestration,
React screens, routing, or the application's service-worker lifecycle into the
package.

## Outcome and decision drivers

The library should let a PWA:

- download one or more large binary assets with bounded memory;
- expose observable progress and explicit stop/retry controls;
- preserve completed work after navigation, process termination, or network
  interruption;
- store media without WebKit's unreliable raw-Blob IndexedDB path;
- avoid automatic retry loops after a crash;
- prevent duplicate transfers for the same asset;
- retrieve one asset without hydrating every cached asset;
- remove assets without loading their binary contents;
- keep small synchronous application state under namespaced keys;
- use the same core from React or another UI framework.

Ranked quality attributes:

1. **Memory safety:** memory must scale with the active chunk or asset, not the
   total offline collection.
2. **Recoverability:** completed chunks or assets survive interruption and are
   never silently discarded.
3. **Correct cancellation:** stop terminates network work, reaches a stable
   state, and keeps verified progress.
4. **Portability:** no dependency on Audiobookshelf, React, the Beskar router,
   or one service-worker implementation.
5. **Schema evolution:** upgrades are versioned, testable, and do not require a
   flag-day copy of the complete media library.
6. **Operational clarity:** consumers can observe state transitions and errors
   without exposing credentials or signed URLs.

## Current-state evidence

The current implementation is split across:

- `src/lib/downloads.ts`: transfer sequencing, timeouts, cancellation, progress,
  played-track caching;
- `src/lib/storage.ts`: IndexedDB stores, media serialization, localStorage,
  migrations and deletion;
- `src/hooks/useOffline.ts`: active-transfer registry and React Query refresh;
- `src/hooks/usePlayback.ts`: offline playback selection and object URLs;
- `public/sw.js`: application shell and cover caching policy;
- `src/lib/api.ts`: Audiobookshelf URLs, sessions and authorization.

Verified failure modes that the boundary must prevent:

- storing raw `Blob` values can fail in WebKit IndexedDB;
- hydrating and rewriting all previously downloaded tracks after each new
  track causes cumulative memory growth and WebKit process termination;
- a persisted `downloading` flag does not prove a live request still exists;
- automatic startup recovery can turn one crash into an infinite retry loop;
- service-worker interception of media or Range requests can break iPhone
  background playback.

The code graph also shows high coupling between `src/lib`, hooks, and pages.
The extraction should reduce dependency direction without creating a second
runtime service.

## Scope boundaries

### The package owns

- transfer state machine and legal transitions;
- one active transfer per asset key;
- abort, stop, retry and bounded backoff policies;
- progress events and terminal results;
- Range capability probing and chunk planning;
- IndexedDB schema, transactions, migrations and garbage collection;
- binary serialization as `ArrayBuffer` or chunks, never raw persisted Blob;
- namespaced small key-value storage with JSON validation hooks;
- storage quota inspection and actionable quota failures;
- optional React bindings in a separate entry point;
- deterministic test adapters and failure injection.

### Beskar Shelf owns

- mapping `BookItem`, playback sessions and ABS tracks to generic assets;
- obtaining fresh authenticated URLs or request headers;
- choosing which chapters/tracks the user requested;
- UI labels, buttons, progress presentation and confirmations;
- audiobook playback and chapter semantics;
- cover-cache policy and service-worker registration;
- progress synchronization back to Audiobookshelf;
- application preferences that are not part of offline transfers.

### Explicitly deferred

- a separate repository;
- native iOS background transfer APIs;
- cloud synchronization of cached media;
- encryption-at-rest beyond browser-origin isolation;
- DRM support;
- automatic transcoding or media splitting;
- making the library own application authentication tokens;
- automatic retry on application startup.

## Target package layout

```text
packages/pwa-offline-media/
├── package.json
├── tsconfig.json
├── src/
│   ├── core/
│   │   ├── client.ts            # public orchestration API
│   │   ├── state-machine.ts     # legal transfer transitions
│   │   ├── planner.ts           # whole-asset and Range chunk plans
│   │   ├── errors.ts            # stable typed errors
│   │   └── events.ts            # progress/state subscription contract
│   ├── storage/
│   │   ├── types.ts             # storage port
│   │   ├── indexeddb.ts         # production adapter using idb
│   │   ├── migrations.ts        # versioned schema upgrades
│   │   └── memory.ts            # deterministic test adapter
│   ├── network/
│   │   ├── types.ts             # request factory and response port
│   │   └── fetch.ts             # browser fetch adapter
│   ├── kv/
│   │   ├── types.ts             # small synchronous KV port
│   │   └── local-storage.ts     # namespaced localStorage adapter
│   ├── react/
│   │   └── use-offline-media.ts # optional thin binding
│   └── index.ts
└── tests/
    ├── state-machine.test.ts
    ├── interruption.test.ts
    ├── indexeddb.test.ts
    ├── quota.test.ts
    └── multi-client.test.ts
```

Dependency direction:

```text
Beskar / another PWA
        │ maps domain objects and supplies requests
        ▼
public client API ──► state machine ──► network port
        │                    │
        └────────────────────┴───────► storage port
                                          │
                              IndexedDB / memory adapter

React binding ──► public client API
Audiobookshelf client ──► Beskar adapter only
```

Core code must compile and run without React, Audiobookshelf types, browser
routing, or a service worker.

## Public contracts

Illustrative API; exact names may change during the characterization phase.

```ts
export type TransferState =
  | 'idle'
  | 'queued'
  | 'downloading'
  | 'stopping'
  | 'stopped'
  | 'interrupted'
  | 'failed'
  | 'complete'

export interface OfflineAsset {
  id: string
  groupId?: string
  filename?: string
  mimeType?: string
  expectedBytes?: number
  metadata?: Record<string, unknown>
}

export interface RuntimeRequest {
  url: string
  headers?: HeadersInit
}

export interface OfflineMediaClient {
  enqueue(asset: OfflineAsset): Promise<void>
  start(assetId: string): Promise<TransferResult>
  stop(assetId: string): void
  retry(assetId: string): Promise<TransferResult>
  remove(assetId: string): Promise<void>
  status(assetId: string): Promise<TransferSnapshot | undefined>
  list(groupId?: string): Promise<TransferSnapshot[]>
  readBlob(assetId: string): Promise<Blob | undefined>
  subscribe(listener: (event: TransferEvent) => void): () => void
}

export interface OfflineMediaOptions {
  namespace: string
  storage: OfflineStorage
  requestFactory: (asset: OfflineAsset) => Promise<RuntimeRequest>
  chunkBytes?: number
  concurrency?: number
  clock?: () => number
}
```

`requestFactory` is invoked at transfer time. Authorization headers and signed
URLs are never written into IndexedDB, localStorage, logs, events, or snapshots.

## State machine and failure behavior

Legal high-level transitions:

```text
idle ──► queued ──► downloading ──► complete
                   │       │
                   │       ├──► stopping ──► stopped
                   │       ├──► interrupted
                   │       └──► failed
                   └────────────► stopped

stopped / interrupted / failed ──explicit retry──► queued
```

Rules:

- persisted state is descriptive, not proof that a request is alive;
- only the in-memory owner may report `downloading` as active;
- application startup converts abandoned `downloading` work to `interrupted`;
- startup never retries automatically;
- stop aborts the current fetch and persists verified progress;
- retry resumes from verified chunks or completed assets;
- duplicate `start` calls return the existing promise or a typed conflict;
- terminal errors are typed as cancellation, network, HTTP, integrity, quota,
  storage, unsupported-range or unknown;
- retries use bounded attempts and caller-controlled scheduling;
- progress events never contain credentials or full private URLs.

## Durable data model

Use a configurable IndexedDB database name derived from `namespace`.

### `assets`

```ts
interface StoredAsset {
  id: string
  groupId?: string
  state: TransferState
  mimeType?: string
  expectedBytes?: number
  persistedBytes: number
  chunkBytes?: number
  etag?: string
  lastModified?: string
  completedRanges: Array<{ start: number; end: number }>
  error?: { code: string; message: string; retryable: boolean }
  metadata?: Record<string, unknown>
  createdAt: number
  updatedAt: number
  schemaVersion: number
}
```

### `chunks`

- compound key: `[assetId, start]`;
- value: `ArrayBuffer` plus `end`, byte length and optional checksum;
- one transaction persists a chunk and advances the asset manifest;
- consumers never fetch all chunks merely to list assets;
- deletion uses keys/cursors, not hydrated binary values.

### `objects` compatibility store

Whole-asset storage remains available for servers without Range support and
for small files. It uses `ArrayBuffer`, MIME type and byte length. It must be
read one asset at a time.

### Namespaced key-value storage

Use localStorage only for small synchronous JSON values such as preferences or
resume pointers. Requirements:

- prefix every key with the configured namespace;
- validate decoded data through a caller-supplied decoder;
- expose versioned migration and deletion methods;
- reject binary data and oversized values;
- do not persist authorization tokens by default;
- do not use localStorage as a transfer queue or media store.

## Download algorithm

### Phase-one compatibility mode

1. Ask `requestFactory` for a fresh request.
2. Fetch one complete asset with one active transfer by default.
3. Stream progress while holding at most that one asset.
4. Serialize and persist only that asset.
5. Release its response chunks and retain metadata only.
6. Move to the next queued asset.

This preserves Beskar 0.5.1 behavior while moving ownership behind package
ports.

### Phase-two resumable mode

1. Probe with `HEAD` or a small Range request.
2. Record content length, ETag/Last-Modified and Range support.
3. Split the asset into configurable chunks; start conservatively at 4 MiB.
4. Fetch missing ranges sequentially on iOS by default.
5. Persist each verified chunk before requesting the next.
6. On retry, request only missing ranges when the validator still matches.
7. If the validator changes, mark existing chunks stale and require an
   explicit restart decision.
8. Reconstruct a Blob only when the consumer requests it; avoid assembling the
   complete collection or unrelated assets.
9. Fall back to phase-one whole-asset mode when Range is unsupported.

Chunk size and concurrency remain configuration, not hardcoded platform facts.
Measure them on the supported physical devices before changing defaults.

## Service-worker and Cache API boundary

The package does not register or update a service worker in phase one.

It may later provide pure policy helpers, but the application owns routing and
lifecycle because these are coupled to its shell and deployment:

- media and Range requests remain network-native on iOS;
- application shells may use network-first navigation;
- immutable build assets may be precached;
- covers or thumbnails may use a separate cache with sanitized keys;
- authenticated API responses are not cached by default;
- a service worker must not become the only cancellation or recovery owner.

## React and application adapters

The optional React entry point must be a thin subscriber, not the owner of
transfer correctness:

```ts
const snapshot = useOfflineAsset(client, assetId)
const downloads = useOfflineGroup(client, bookId)
```

Beskar adds an adapter that:

- maps one ABS track to one `OfflineAsset`;
- sets `groupId` to the library item ID;
- creates authenticated stream requests from the current ABS session;
- translates generic events into `DownloadProgress` UI state;
- maps complete track assets into the player's source loader;
- retains chapter and book semantics outside the package.

The second PWA implements only its domain mapping and request factory.

## Migration and adoption

Avoid a flag-day rewrite.

### Phase 0 — characterization

- keep the current 0.5.1 tests green;
- add contracts for stop, manual recovery, ten-plus assets, per-asset reads,
  deletion without hydration and WebKit-safe ArrayBuffer storage;
- capture current database/store/key shapes as fixtures.

### Phase 1 — package scaffold and façade

- add npm workspaces and `packages/pwa-offline-media`;
- move pure types, state transitions and errors first;
- add in-memory adapters and deterministic tests;
- introduce a Beskar-owned façade matching current `downloadBook`, storage and
  hook call sites;
- do not change the persisted schema or UI in this phase.

Exit criterion: Beskar behavior and persisted-data compatibility are unchanged
while core state tests run without React or IndexedDB.

### Phase 2 — IndexedDB adapter

- move schema and transactions behind `OfflineStorage`;
- configure Beskar to use its existing database name and store names;
- dual-read legacy metadata that lacks byte-size fields;
- write the new manifest format only after successful reads;
- migrate records lazily per asset instead of copying the whole library;
- keep a feature switch that can route Beskar back to the compatibility façade.

Exit criterion: existing offline downloads remain visible and playable; new
downloads use package storage; rollback does not delete or rewrite media.

### Phase 3 — Range chunks

- add probing and chunk persistence behind a disabled-by-default capability;
- enable for one test title, then selected users/devices;
- retain whole-asset fallback;
- measure memory, retries, throughput and storage overhead on a physical iPhone.

Exit criterion: killing the PWA mid-transfer and retrying downloads only the
missing ranges with bounded memory and no duplicate chunks.

### Phase 4 — second PWA consumer

- consume the workspace package through `npm pack` or a registry artifact built
  from this repository;
- implement a separate namespace, request factory and domain mapping;
- run the same contract suite against that application's browser matrix;
- publish from this repository only after both consumers need reproducible
  versioned artifacts.

## Distribution strategy

Initial development uses an npm workspace and private package visibility.

For another repository, choose one of:

1. CI creates an `npm pack` tarball attached to a tagged release;
2. publish the package to GitHub Packages or another approved registry;
3. use a local `file:` dependency only for development on the same machine.

Do not depend on an unpublished subdirectory through an ambiguous Git URL.
Keep the package version independent from the Beskar application version once
the second consumer exists.

## Security and privacy

- never persist bearer tokens, cookies, signed query parameters or complete
  authenticated URLs;
- request factories return secrets only at execution time;
- sanitize errors and telemetry;
- isolate data by origin, database namespace and asset key;
- validate metadata before rendering it in either consumer;
- expose explicit purge-by-asset, purge-by-group and purge-namespace methods;
- do not claim browser storage is encrypted or permanent;
- handle quota rejection without deleting unrelated data;
- request persistent storage only from an application-owned user flow.

## Observability

Provide structured, secret-free events:

- state transition with asset ID and timestamps;
- received and persisted bytes;
- retry count and normalized error code;
- storage usage estimate when available;
- capability result: Range, validator and fallback mode;
- cancellation latency;
- orphan cleanup count.

The package emits events; consumers decide whether and where to record them.

## Verification matrix

| Requirement | Evidence |
|---|---|
| Legal state transitions | State-machine unit tests, including rejected transitions |
| One owner per asset | Concurrent-start and multi-client tests |
| Cancellation | Fetch abort test plus stable `stopped` manifest readback |
| Manual recovery | Reload fixture converts abandoned work to `interrupted` without network activity |
| Memory boundedness | Failure-injection test proves prior assets are not hydrated; physical-device profile validates the configured chunk budget |
| WebKit-safe storage | IndexedDB integration test asserts persisted binary values are ArrayBuffer/chunks, not Blob |
| Resume correctness | Kill/reload Range integration test requests only missing offsets |
| Integrity | ETag/Last-Modified mismatch test invalidates stale chunks |
| Quota behavior | Quota failure leaves verified chunks and unrelated assets intact |
| Deletion | Key/cursor deletion test proves binary values are not read first |
| LocalStorage safety | Namespace, decoding, version migration and size-limit tests |
| React independence | Core package tests run without React or DOM |
| Cross-app reuse | Same contract suite passes in Beskar and the second PWA |
| iOS delivery | Physical-iPhone foreground download, stop, crash/reopen and playback checks |

## Rollout and rollback

- retain current Beskar modules behind the compatibility façade until phase-two
  readback and physical-device checks pass;
- gate new chunk storage by capability/configuration;
- never downgrade or delete existing stores during rollout;
- rollback switches the façade to the prior engine while leaving new stores
  untouched;
- remove old code only after both fresh and upgraded profiles pass and at least
  one release has run without migration or recovery incidents;
- document any schema that cannot be read by the rollback version before
  enabling it by default.

## Risks and open decisions

| Risk or decision | Current position | Resolution evidence |
|---|---|---|
| IndexedDB versus OPFS for chunks | IndexedDB first for compatibility; keep storage port replaceable | Physical-device throughput, quota and eviction tests |
| Default chunk size | Provisional 4 MiB | iPhone memory and throughput matrix |
| Parallel chunks | Sequential on iOS initially | Measured benefit without memory regression |
| Multi-tab ownership | Prefer Web Locks, with a lease fallback when unavailable | Duplicate-start browser test |
| Registry choice | Defer until second consumer | Consumer deployment and access requirements |
| Full offline playback memory | Load current/next track lazily rather than every Blob | Player integration spike and lock-screen transition tests |
| Background downloading | Not promised for web PWAs | Native wrapper decision if foreground recovery is insufficient |

## Implementation-ready first slice

The first implementation task should create only:

1. package workspace and public types;
2. pure transfer state machine;
3. in-memory storage/network test adapters;
4. characterization tests copied from current cancellation and recovery cases;
5. a Beskar façade that still delegates to the current implementation.

This slice is successful when no production code path or persisted record has
changed, but the reusable contracts compile and their state-machine tests pass.
It is reversible by deleting the unused package and façade.
