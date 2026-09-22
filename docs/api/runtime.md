# Runtime and adapter APIs

[Usage reference](../../usage.md) · [Storage](storage.md) · [Export index](exports.md)

Use these APIs to tune managed resources or implement a storage adapter. Most
applications only need database/storage options and lifecycle cleanup.

## Memory accounting

`new MemoryManager({ maxBytes })` coordinates soft accounting and up-front hard
reservations. It is exported from `@hyos/hydb`. Pass one instance to storage and
the database to account for both retained query state and persistent page cache.

```ts
// resources.ts
import { hydb, MemoryManager, type StorageDatabase } from "@hyos/hydb";
import { nodeSpillStore, openKeyValueStorage } from "@hyos/hydb/node";
import { schema } from "./model.js";

export async function openWithBudgets(directory: string, spillDirectory: string) {
  const memory = new MemoryManager({ maxBytes: 128 * 1024 * 1024 });
  const store = await nodeSpillStore({
    directory: spillDirectory, maxBytes: 1024 * 1024 * 1024,
  });
  let storage: StorageDatabase | undefined;
  try {
    storage = await openKeyValueStorage({ schema, directory, memory });
    const database = await hydb.database({ schema, storage, memory,
      spill: { store, memoryBytes: 8 * 1024 * 1024 },
    });
    return { database, async close() {
      try { await database.close(); } finally { await store.close(); }
    } };
  } catch (error) {
    try { await storage?.close(); } finally { await store.close(); }
    throw error;
  }
}
```

| MemoryManager API | Behavior |
| --- | --- |
| `maxBytes` / `setMaxBytes(bytes)` | Read/change budget; lowering it attempts reclamation. |
| `track({ owner, bytes?, priority?, reclaim? })` | Returns a `MemoryHandle` for soft accounting. `reclaim(targetBytes)` releases application state and returns the bytes freed. |
| `reserve({ owner, bytes?, priority? })` | Reclaims first, then throws `MemoryLimitExceededError` if the initial reservation cannot fit. The handle is pinned. |
| `reclaim(bytes)` | Requests reclamation and returns bytes actually freed. |
| `stats()` | `MemoryStats` including budget, usage, available/over-budget bytes, allocations, evictions, reclaimed bytes, and `byOwner`. |

`MemoryAllocation` describes tracked ownership. A `MemoryHandle` has `bytes`,
`resize(bytes)`, `touch()`, `pin()`, `unpin()`, and `release()`. Balance pins and
release ownership at disposal. Resizing updates accounting; it is not a fresh
hard reservation. Pinned/non-reclaimable state can exceed the soft budget.
`estimateMemoryBytes(value)` estimates retained JS size; it is not a heap profiler.
`MemoryLimitExceededError` exposes `requestedBytes` and `availableBytes`.

The budget does not bound process RSS, all transient allocations, or LMDB's native
memory. Use stats to diagnose managed owners and measure process memory separately.

## Spill stores

`SpillOptions` is `{ store: SpillStore, memoryBytes? }`; `memoryBytes` defaults to
8 MiB per spilling operator. `memorySpillStore({ maxBytes })` is synchronous and
keeps spill data in memory. `await nodeSpillStore({ directory, maxBytes })` creates
a file-backed store. The application owns the supplied spill store and closes it
after the database has released its sessions.

| Interface | API |
| --- | --- |
| `SpillStore` | `createSession({ owner, signal? })` returns a promise; `stats()` returns counters; `close()` returns a promise. |
| `SpillSession` | `writeRun(kind, records)` stores byte-record arrays and returns a run; `readRun(run)` asynchronously yields records; `removeRun(run)` and `close()` release storage. Await writes/removals/close. |
| `SpillRun` | Identifies a run with `id`, `kind`, `bytes`, and `records`. |
| `SpillRunKind` | `"sort"`, `"hash"`, or `"arrangement"`. |
| `SpillStats` | `maxBytes`, `usedBytes`, `sessions`, `runs`, `bytesWritten`, `bytesRead`. |

`SpillLimitExceededError` exposes requested/available bytes.
`SpillCorruptionError` indicates invalid spill data. Propagate failures and dispose
the affected operation; spilling is temporary workspace, not durable application
storage. A memory spill store does not move data off the heap.

Sources: [memory](../../packages/hydb/src/memory.ts),
[spill contract](../../packages/hydb/src/spill.ts),
[file spill](../../packages/hydb/src/node/spill-store.ts).

## Immutable trees and page stores

`ImmutableBPlusTree` from `@hyos/hydb/node` is a byte-key/byte-value tree over a
`TreePageStore`. Construct with `new ImmutableBPlusTree(store, options?)`;
options are `cacheBytes` (default 16 MiB), `maxEntries` (default 64, minimum 4),
and `memory`. `TreeRoot` is an opaque `PageId` or `null` for an empty tree.
A `PageId` is numeric but must not be interpreted as a file offset.

| Tree API | Result |
| --- | --- |
| `get(root, keyBytes)` | Promise of value bytes or undefined. |
| `mutate(root, mutations)` | Promise of a new immutable root; earlier roots remain readable while their pages exist. |
| `scan(root, range?)` | Async iterable of individual `TreeEntry` objects `{ key, value }`. |
| `pageChildren(pageId)` | Promise of referenced page IDs. |
| `copyRootsTo(roots, targetTree)` | Promise of `{ roots, pagesCopied }`; copies a forest while preserving shared pages. |
| `maxEntries` | Configured page entry limit. |
| `cacheStats()`, `reclaimCache(bytes)`, `setCacheLimit(bytes)` | Cache accounting/control. |
| `dispose()` | Releases cache accounting; does not close the supplied page store. |

`TreeMutation` is `{ type: "put", key, value }` or `{ type: "delete", key }`,
with byte arrays. `TreeRange` has byte-array `gt/gte/lt/lte`, `reverse`, and `limit`.
Ordering is bytewise; there is no schema or principal enforcement at this layer.

Implement `TreePageStore.readPage(id)` and `writePage(payload, children?)` as
asynchronous methods. Writes allocate fresh IDs and own input bytes; reads return
caller-owned buffers; missing pages reject. The children list must describe all
references. Optional `writePageOwned(payload, children)` transfers the buffer:
the caller must never reuse/mutate it. IDs cannot be recycled while referenced.
The owner serializes writes and provides durability, atomic root publication,
page lifetime/GC, and backing-store cleanup; the page interface supplies none of
those on its own.

## Byte cache and key encoding

`new ByteLruCache<Key, Value>(maxBytes, load, weight, options?)` caches asynchronously
loaded values with a byte-weight function. Options: `memory`, `owner`, `priority`.
It exposes `maxBytes`, `get(key)`, `clear()`, `dispose()`, `setMaxBytes(bytes)`,
`reclaim(bytes)`, and `stats()`. `get` is asynchronous; concurrent misses for a key
share loading work. Oversize values can be returned without retention. Dispose
releases accounting. `PageCacheStats` contains `hits`, `misses`, `evictions`,
`residentBytes`, and `entries`.

`encodeOrderedKey(tuple)` encodes a `StorageKey` into comparable bytes. Supported
parts are null, booleans, finite numbers, valid Dates, and strings; negative zero
normalizes to zero. `keyPrefixUpperBound(prefixBytes)` appends a `0xff` sentinel to form an exclusive upper
bound for encoded tuple prefixes. Use it with this codec, not arbitrary byte
strings. These are key helpers; the
internal row encoder/decoder are not public exports.

Sources: [tree](../../packages/hydb/src/node/bplus-tree.ts),
[page contract](../../packages/hydb/src/node/tree-page-store.ts),
[cache](../../packages/hydb/src/node/page-cache.ts),
[key codec](../../packages/hydb/src/node/codec.ts).
