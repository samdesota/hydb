# Persistence, migration, and retention

Use this reference when selecting a persistent engine or changing stored data.
Examples assume an existing application schema.

## Choose an engine

| API | Storage | Schema changes |
| --- | --- | --- |
| `openStorage({ schema, directory, migrations })` | **Default.** LMDB, 500-commit window | Ordered schema/data migrations; migrates a legacy `hydb.data` |
| `openKeyValueStorage({ schema, directory, migrations })` | LMDB, retains forever unless configured | Ordered schema/data migrations |
| `openKeyValueStorage({ schema, store: memoryKeyValueStore() })` | KV engine with an ephemeral backend | Same as the KV engine |
| `memoryStorage({ schema })` | Ephemeral memory | Recreate for a new schema |
| `openNodeStorage(...)` | Legacy append-only file engine (deprecated) | Ordered schema/data migrations |

All except `memoryStorage` are imported from `@438d/hydb/node`. New code uses
`openStorage`:

```ts
import { hydb } from "@438d/hydb";
import { openStorage } from "@438d/hydb/node";
import { appSchema, migrations } from "./model.js";

const storage = await openStorage({
  schema: appSchema,
  directory: "./data/project-app",
  migrations,
  gcIntervalMs: 10 * 60_000,
});
const database = await hydb.database({ schema: appSchema, storage });
// Use the database; close it on shutdown.
await database.close();
```

`openStorage` keeps its database in `<directory>/lmdb`, applies
`defaultRetention` (`{ mode: "window", keepAtLeast: 500 }`) unless `retention`
is given, and runs garbage collection on `gcIntervalMs` when set (off by
default; `onGarbageCollection` observes timed runs). Open each directory from
one process at a time.

The KV engine owns and closes a supplied `store`. Its LMDB backend waits for
durable publication before advancing public heads and emitting changes. After
an uncertain publication/I/O failure, close and reopen; validation failures
before publication leave the previous head intact.

## Schema migrations

Define the desired schema and pass an ordered migration list. Both engines
accept the same list. For example, after adding a nullable `archivedAt`
timestamp to the `tasks` table:

```ts
import { timestamp } from "@438d/hydb";
import { ddl, defineMigration, openStorage } from "@438d/hydb/node";

const migrations = [
  defineMigration({
    id: "0001-task-archived-at",
    steps: [ddl.addColumn("tasks", "archivedAt", timestamp())],
  }),
];
const storage = await openStorage({
  directory: "./data/project-app",
  schema: latestSchema,
  migrations,
});
```

Here `latestSchema` includes the new column; do not pass the old schema. Append
migrations; never rewrite published ones. Each step is one commit per branch
and carries a progress marker, so reopening resumes after an interruption. A
stored schema outside the declared chain is rejected without writing. Data
steps (`data(async (db) => ...)`) may run before a later step adds an index;
that step builds the index from existing rows.

The public API also exports `describeSchema`, `diffSchemaDescriptions`, and
`checkMigrationChain` for tooling. Inspect their installed declarations before
building a migration generator. The repository's migration CLI is development
tooling and is not an installed npm executable.

## Moving file databases to LMDB

`openStorage` handles the common case. When `<directory>/lmdb` is missing and
`<directory>/hydb.data` exists, it calls `migrateFileStorage` first:

1. Clone `hydb.data` into a staging directory (the source is never opened
   writable), apply `migrations` to the clone with the file engine, and
   compact it to the retention window. History outside the window is not
   imported.
2. Import the clone into LMDB, verifying pages, commits, branches, history and
   data-derived queries.
3. Reopen with `migrations` and `retention`, confirm the source is
   byte-identical, then rename the result to `<directory>/lmdb`.

A failure removes the staging directory and leaves no destination, so the next
open retries from the start. `hydb.data` is kept for rollback: delete `lmdb/`
to return to it with the old engine, which loses LMDB-only writes. Remove
`hydb.data` once the cutover is confirmed. Stop every writer of the file
database first; the migration fails if the source changes meanwhile.

`migrateFileStorage({ sourceDirectory, destinationDirectory, schema,
migrations, retention })` runs the same steps offline. `importFileStorage`
is the lower-level import: it requires every branch head to match `schema`
already and does not apply migrations or retention. The import buffers commit
locations, visited page IDs, and working payloads; it is not constant-memory
for arbitrary databases.

Migrating changes only the database. Sibling media or preference files are
separate cutover work.

## Retention and garbage collection

`openStorage` keeps a 500-commit window per branch by default. The lower-level
engines retain history forever unless a window is given:

```ts
const storage = await openKeyValueStorage({
  schema: appSchema,
  directory: "./data/project-app/lmdb",
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

Collection is explicit unless `gcIntervalMs` is set. KV reader pins are local to
the storage instance: use one active instance per database during collection.
Metadata comparisons reject stale writers but do not synchronize instances or
provide distributed subscriptions.

The KV collector yields between batches (`gcBatchSize` is 1–4096 records), yet
still scans history/pages and tracks reachable page IDs in memory. The batch
size is not a strict time or byte bound. LMDB reuses reclaimed pages without
necessarily shrinking the file. Reported bytes describe logical payloads, not
filesystem size; legacy stores without page-size sidecars may report incomplete
accounting. File-engine collection instead compacts into a replacement file.
