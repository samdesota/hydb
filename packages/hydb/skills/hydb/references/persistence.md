# Persistence, migration, and retention

Use this reference when selecting a persistent engine or changing stored data.
Examples assume an existing application schema. The file engine and LMDB engine
share `StorageDatabase`, but they have different migration and cleanup behavior.

## Choose an engine

| API | Storage | Schema changes |
| --- | --- | --- |
| `memoryStorage({ schema })` | Ephemeral memory | Recreate for a new schema |
| `openNodeStorage({ schema, directory, migrations })` | Append-only file engine | Ordered schema/data migrations |
| `openKeyValueStorage({ schema, directory })` | LMDB by default | Reopening requires the same schema |
| `openKeyValueStorage({ schema, store: memoryKeyValueStore() })` | KV engine with an ephemeral backend | Same schema constraints as the KV engine |

All except `memoryStorage` are imported from `@438d/hydb/node`. Keep an existing
application's engine unless its requirements call for a change. Do not point a
different engine at existing data and assume conversion will happen.

```ts
import { hydb } from "@438d/hydb";
import { openKeyValueStorage } from "@438d/hydb/node";
import { appSchema } from "./model.js";

const storage = await openKeyValueStorage({
  schema: appSchema,
  directory: "./data/project-app-lmdb",
});
const database = await hydb.database({ schema: appSchema, storage });
// Use the database; close it on shutdown.
await database.close();
```

The KV engine owns and closes a supplied `store`. Its LMDB backend waits for
durable publication before advancing public heads and emitting changes. After
an uncertain publication/I/O failure, close and reopen; validation failures
before publication leave the previous head intact.

## File-engine schema migrations

Define the desired schema and pass an ordered migration list to `openNodeStorage`.
For example, after adding a nullable `archivedAt` timestamp to the `tasks` table:

```ts
import { timestamp } from "@438d/hydb";
import { ddl, defineMigration, openNodeStorage } from "@438d/hydb/node";

const migrations = [
  defineMigration({
    id: "0001-task-archived-at",
    steps: [ddl.addColumn("tasks", "archivedAt", timestamp())],
  }),
];
const storage = await openNodeStorage({
  directory: "./data/project-app",
  schema: latestSchema,
  migrations,
});
```

Here `latestSchema` includes the new column; do not pass the old schema.
Migration progress is committed so reopening can resume after interruption.
The public API also exports `data`, `describeSchema`, `diffSchemaDescriptions`,
and `checkMigrationChain` for data steps and tooling. Inspect their installed
declarations before building a migration generator. The repository's migration
CLI is development tooling and is not an installed npm executable.

General schema migrations are not supported by `openKeyValueStorage`; importing
a file database does not add that capability.

## Offline file-to-LMDB import

Stop all writers before importing. The importer verifies source identity and
content, but does not acquire a cross-process writer lock. Use a new destination:

```ts
import { importFileStorage } from "@438d/hydb/node";
import { appSchema } from "./model.js";

const report = await importFileStorage({
  sourceFile: "./data/project-app/hydb.data",
  destinationDirectory: "./data/project-app-lmdb",
  schema: appSchema,
});
console.log(report);
```

The source is read-only. The import preserves published history, branch metadata,
and retained commits; it verifies copied records and query results before
publishing destination metadata. Active branch heads must match the supplied
schema. An interrupted import is incomplete and not resumable; retry with a new
destination. Existing destinations are never overwritten.

Importing changes only the database. Changing the application's storage adapter
and handling sibling media/preferences are separate cutover work. Preserve the
source for rollback. The importer buffers commit locations, visited page IDs,
and working payloads; it is not constant-memory for arbitrary databases.

## Retention and garbage collection

Persistent engines retain history forever by default. A window is opt-in:

```ts
const storage = await openKeyValueStorage({
  schema: appSchema,
  directory: "./data/project-app-lmdb",
  retention: { mode: "window", keepAtLeast: 100 },
  gcBatchSize: 128,
});
const report = await storage.collectGarbage();
```

Choose the retention window to match application history requirements. Branch
heads/bases, named retains, open snapshots, and unread change history protect
commits. Close snapshots and consumed iterators promptly. An expired cursor
raises `HistoryUnavailableError`; consumers need a fresh snapshot rather than
assuming all history is still available.

GC is explicit, with no background timer. KV reader pins are local to the
storage instance: use one active instance per database during collection.
Metadata comparisons reject stale writers but do not synchronize instances or
provide distributed subscriptions.

The KV collector yields between batches (`gcBatchSize` is 1–4096 records), yet
still scans history/pages and tracks reachable page IDs in memory. The batch
size is not a strict time or byte bound. LMDB reuses reclaimed pages without
necessarily shrinking the file. Reported bytes describe logical payloads, not
filesystem size; legacy stores without page-size sidecars may report incomplete
accounting. File-engine collection instead compacts into a replacement file.
