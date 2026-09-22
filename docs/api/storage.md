# Storage API

[Usage reference](../../usage.md) · [Database](database.md) · [Runtime adapters](runtime.md)

Application code normally uses transactions and gateways. This section covers
backend selection, direct storage operations, persistence, and schema evolution.
Low-level storage operations do not apply principal policies or command schemas.

## Choose and open a backend

| Backend | Factory and purpose |
| --- | --- |
| Memory | `await memoryStorage({ schema })` from `@hyos/hydb`; ephemeral storage for tests or local state. |
| File | `await openNodeStorage({ schema, directory, migrations? })` from `@hyos/hydb/node`; append-only file engine with declarative migrations. |
| Key-value | `await openKeyValueStorage({ schema, directory })` from `@hyos/hydb/node`; immutable trees backed by LMDB. This engine is currently described as an opt-in prototype. |
| Custom key-value adapter | `await openKeyValueStorage({ schema, store })`; same engine over a `KeyValueStore`. Choose either `directory` or `store`. |

```ts
// database.ts — Node only
import { hydb } from "@hyos/hydb";
import { openKeyValueStorage } from "@hyos/hydb/node";
import { schema } from "./model.js";

export async function openDatabase(directory: string) {
  const storage = await openKeyValueStorage({ schema, directory });
  try { return await hydb.database({ schema, storage }); }
  catch (error) { await storage.close(); throw error; }
}
// The caller owns the returned database and awaits database.close() at shutdown.
```

`NodeStorageDatabase.open(options)` and `KeyValueStorageDatabase.open(options)`
are equivalent class factories. Both implement `StorageDatabase`. The file
engine additionally exposes `cacheStats()`, `reclaimCache(bytes)`, and
`setCacheLimit(bytes)`.

Shared options are `schema`, `retention`, `cacheBytes` (default 16 MiB),
`maxEntries` (default 64 per tree page), and `memory` (a `MemoryManager`).
`NodeStorageOptions` also requires `directory` and accepts `migrations`.
`KeyValueStorageOptions` chooses directory/store and adds `gcBatchSize`
(default 128, integer 1–4096). The KV engine owns an injected store and closes it
on shutdown or failed opening. Do not reuse that store in another owner.

Use one active writer per database. KV metadata compare-and-publish rejects a
stale instance; it does not refresh that instance or broadcast other instances'
commits to its listeners. Reader pins used by KV GC belong to one instance.

## StorageDatabase and snapshots

| API | Contract |
| --- | --- |
| `head(branch?)` | Promise of opaque `CommitId`; branch defaults to `main`. |
| `snapshot(selector?)` | Promise of a consistent `StorageSnapshot`; omit for current main, or select `{ branch }` / `{ commit }`. |
| `createBranch({ name, from })` | Creates a branch at an existing commit. No public branch merge or delete operation. |
| `commit({ branch?, expectedHead, mutations })` | Atomically applies mutations against the expected head and returns a `CommitBatch`. |
| `changes({ branch?, after, signal? })` | Async iterable of batches with branch sequence greater than `after`, followed by live commits. Abort or return the iterator when done. |
| `retain({ name, commit })` | Names a commit as a persistent GC root. |
| `releaseRetention(name)` | Removes that named root; reclamation waits for a later collection. |
| `collectGarbage()` | Runs backend collection and returns accounting. |
| `close()` | Closes the owner; await completion. |

A `StorageSnapshot` exposes `commit`, optional `branch`, `sequence`, `get(table,
key)`, `scan(request)`, and async `close()`. `get` returns a row or `undefined`.
`scan` yields **batches of rows**, not individual rows. Always close snapshots:

```ts
// scan.ts
import type { StorageDatabase } from "@hyos/hydb";
import { tasks } from "./model.js";

export async function tasksForProject(storage: StorageDatabase, projectId: string) {
  const snapshot = await storage.snapshot();
  try {
    const rows = [];
    for await (const batch of snapshot.scan({
      type: "index", table: tasks, index: "tasks_by_project", key: [projectId],
    })) rows.push(...batch);
    return rows;
  } finally {
    await snapshot.close();
  }
}
```

`StorageScan` is `{ type: "table", table, range? }` or
`{ type: "index", table, index: name, key?: prefix, range? }`.
`StorageRange` provides `gt`, `gte`, `lt`, `lte` as `StorageKey` tuples, plus
`reverse` and `limit`. Keys follow primary-key/index column order; index `key`
selects a prefix. These are ordered storage scans, not high-level query filters.

`storageMutation.insert(table, row)`, `.update(table, key, row)`, and
`.delete(table, key)` construct `StorageMutation` values. Insert/update take
**full materialized rows**; update is not a patch and this layer does not apply
transaction insertion defaults. Prefer [transactions](database.md#transactions)
for normal application writes.

`CommitBatch` contains `commit`, `branch`, `sequence`, `parent`, and `changes`.
Each change contains `table`, `key`, and optional `before`/`after` rows.
`CommitId` is a string identity; `BranchName` is a string;
`BranchSequence` is a branch-local number used for ordering. `version` on batches
and snapshots and `expectedVersion` on commit requests are deprecated
compatibility fields. Use identities for expected heads and sequences for streams.

`StorageConflictError` exposes `expectedHead`/`actualHead` (or legacy numeric
versions). Recompute a transaction from a fresh snapshot rather than replaying
stale derived rows. `HistoryUnavailableError` exposes an optional missing
`commit` or `oldestAvailableSequence`; recover expired subscriptions by taking
a fresh snapshot and restarting from its sequence.

Source: [storage.ts](../../packages/hydb/src/storage.ts).

## Retention and garbage collection

`RetentionPolicy` is `{ mode: "forever" }` (persistent default) or
`{ mode: "window", keepAtLeast, keepYoungerThanMs? }`. A window retains at least
the requested number of branch commits and also those within the time window.
Branch heads/bases, named retains, open snapshots, and unread subscription history
can keep additional data alive. Retention is persisted; reopening with an
explicit changed policy updates it. Reducing retention does not itself collect.

`GarbageCollectionReport` contains `commitsCollected`, `recordsCopied`,
`bytesBefore`, `bytesAfter`, and `bytesReclaimed`. File GC copies retained data to
a replacement file; open snapshots can delay deletion of old file generations.
KV GC marks/sweeps pages in slices. `KeyValueGarbageCollectionReport` additionally
contains `pagesCollected`, `accountingComplete`, `pagesWithoutSize`,
`historyEntriesCollected`, and `accounting: "logical-page-and-commit-payloads"`.
Its byte counts are logical payload accounting, not LMDB file size. Freed LMDB
pages may be reused without shrinking the file. `gcBatchSize` bounds work per
slice, not all GC memory.

## KeyValueStore adapters

`memoryKeyValueStore()` returns an ephemeral adapter.
`openLmdbKeyValueStore(directory)` synchronously opens an LMDB adapter; its writes
are asynchronous and await durable completion. Both are Node entry-point exports.

A custom `KeyValueStore` must implement:

| Method | Required behavior |
| --- | --- |
| `get(key)` | Promise of caller-owned bytes or `undefined`. |
| `getMany(keys)` | Promise of values in input order; no cross-key snapshot guarantee. |
| `scan(prefix?, { after?, limit? }?)` | Async iterable of `{ key, value }` entries in UTF-8 byte order. Snapshot at iteration start; `after` is exclusive. |
| `scanKeys(prefix?, options?)` | Same scan semantics yielding strings only. |
| `batch(operations, conditions?)` | Atomic, durable conditional batch. Conditions compare current bytes or absence before any mutation. |
| `close()` | Async resource disposal. |

`KeyValueOperation` is `{ type: "put", key, value }` or
`{ type: "delete", key }`. `KeyValueCondition` is `{ key, expected }`, where
`expected: undefined` requires absence. Failed conditions make no changes and
throw `KeyValueConflictError` with `.key`. After an I/O error, publication may be
uncertain; close/reopen instead of assuming a rollback. Store keys use 1–480 UTF-8
bytes; an empty scan prefix is permitted. Adapters must own input bytes before
yielding, return independent read buffers, and keep scans stable during writes.

Sources: [adapter contract](../../packages/hydb/src/node/key-value-store.ts),
[KV engine notes](../../packages/hydb/KEY_VALUE_PROTOTYPE.md).

## Stored values

Persistent row encoding supports `null`, booleans, strings, finite numbers,
valid `Date` values, arrays, and plain records recursively. It rejects undefined,
non-finite numbers, bigint, and functions. Do not assume a class instance, Map,
Set, or typed array retains its prototype/semantics. Prefer explicit plain data
representations. JSON columns' TypeScript generics do not enforce this at runtime.
The internal `{ $hydb: "date", value: ... }` marker is reserved; do not store
application records with that shape. The [wire codec](application.md#wire-values)
is separate and supports more types.

## File-engine migrations

Pass the **current** schema and an ordered `migrations` list to `openNodeStorage`.
Persist stable migration IDs and keep applied definitions unchanged. Progress is
durable per step and branch, so reopening resumes completed progress; the whole
migration chain is not one atomic transaction. Keep external side effects out of
data steps. KV storage does not run these migrations and requires a matching
schema on reopen.

Example: the current model adds a nullable `description: text()` to `tasks`.
Use this migration with that updated model:

```ts
// migrations.ts
import { text } from "@hyos/hydb";
import { data, ddl, defineMigration } from "@hyos/hydb/node";

export const migrations = [defineMigration({
  id: "001-task-description",
  steps: [
    ddl.addColumn("tasks", "description", text()),
    data(async (db) => {
      for await (const row of db.scan("tasks")) {
        await db.update("tasks", [row.id], { description: "" });
      }
    }),
  ],
})];
```

`defineMigration({ id, steps })` returns `Migration`; a `MigrationStep` is a
`SchemaOp` or a data wrapper made with `data(callback)`. `MigrationDataStep` is
the async callback type. The `ddl` namespace
exposes the same operations as these standalone named exports:

| Operation | Purpose/constraints |
| --- | --- |
| `addTable(tableOrDescription)` | Add a table using a schema table or captured `TableDescription`. |
| `dropTable(tableOrDescription)` | Remove a table, retaining its description in the migration history. |
| `addColumn(tableName, name, spec)` | Add a nullable, non-primary-key, non-indexed column. Existing rows start at null; use a data step to backfill. |
| `dropColumn(tableName, name, previousSpec)` | Remove a non-indexed, non-primary-key column; include its previous definition. |
| `changeColumn(tableName, name, previousSpec, nextSpec)` | Describe type/nullability changes; primary-key/indexed-column changes are restricted. Explicit data conversion is separate. |

`ColumnSpec` is a column builder or `ColumnDescription`. Schema descriptions
capture column name, data type, nullability, primary key, and index metadata,
not defaults or reference callbacks. A builder default does not backfill old
rows. The engine checks whether a planned operation is supported; the description
helpers are not a general-purpose SQL migration engine.

`MigrationDatabase` uses **table names**, not schema table objects:
`scan(name)` yields individual read-only records; `insert(name, row)`,
`update(name, key, patch)`, and `delete(name, key)` return promises. A data step
sees its own buffered writes and publishes one commit when it succeeds.

### Migration inspection and tooling

| API | Returns/purpose |
| --- | --- |
| `describeSchema(schema)` | `SchemaDescription`, a list of `TableDescription` with `ColumnDescription` and `IndexDescription`. |
| `schemaFingerprint(description)` | SHA-256 fingerprint of the ordered description. Use `describeSchema` for canonical ordering. |
| `applySchemaChanges(description, operations)` | Updated description; does not mutate a database. |
| `reverseSchemaChanges(description, operations)` | Previous description; not a data rollback. |
| `deriveMigrationFingerprints(currentSchema, migrations)` | `MigrationFingerprint[]`: base entry (`migrationId: null`) and entries with migration ID, fingerprint, description. |
| `diffSchemaDescriptions(from, to)` | Structural operations; cannot infer data conversions and rejects unsupported required-column additions. |
| `checkMigrationChain(schema, migrations, base?)` | Result with `ok`, base/target fingerprints, base description, `issues` (missing/extra operations per migration), and optional `error`. Pass a known base for stronger verification. |
| `formatMigrationSource(id, operations)` | TypeScript migration source for structural operations; add data steps yourself. |

The repository CLI at `packages/hydb/scripts/migration-cli.mjs` provides `diff`,
`check`, and `generate`. Run it from the repo, referencing exported schemas in
loadable modules:

```sh
node packages/hydb/scripts/migration-cli.mjs diff --from './old.js#schema' --to './new.js#schema'
node packages/hydb/scripts/migration-cli.mjs check --schema './new.js#schema' --migrations './migrations.js#migrations' --base './old.js#schema'
node packages/hydb/scripts/migration-cli.mjs generate --id '001-change' --from './old.js#schema' --to './new.js#schema' --out './001-change.ts'
```

`generate` accepts `--force` to overwrite. Prefer declarative migrations over
legacy `NodeStorageOptions` fields `addNullableColumns`,
`nullableColumnMigrations`, `addedTables`, `addedTableMigrations`, and
`postAddedTableNullableColumnMigrations`; do not combine those with `migrations`.

| Legacy option | Shape/meaning |
| --- | --- |
| `addNullableColumns` | Record of table names to column-name arrays for one addition group. |
| `nullableColumnMigrations` | Ordered array of those records; cannot combine with `addNullableColumns`. |
| `addedTables` | Table-name array for one addition group. |
| `addedTableMigrations` | Ordered array of table-name arrays. |
| `postAddedTableNullableColumnMigrations` | Ordered nullable-column groups applied after table-addition groups. |

Source: [migration.ts](../../packages/hydb/src/node/migration.ts).

## Import file storage into KV storage

`await importFileStorage({ sourceFile, destinationDirectory, schema, openStore?,
onProgress? })` performs an offline import. Stop the source writer first; the
importer does not acquire an application lock. The source is read-only, and
corruption rejects rather than being repaired. The destination must not already
exist; metadata is published last. Failed imports are not resumable: retry at a
new path after investigating the error.

`openStore(directory)` can supply a destination `KeyValueStore`;
`onProgress(phase, count)` reports progress. `FileImportReport` records
`sourceBytes`, `sourceSha256`, page/count byte totals, commits, branches,
`historicalSchemaCommits`, and branch query-verification results. Old-schema
commits can be copied, but that does not make old schemas readable through the
current KV engine. Retain the source until application-level verification passes.

Source: [file import guide](../../packages/hydb/FILE_IMPORT.md).
