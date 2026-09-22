# HyDB and HyApp usage reference

Use this reference when adopting the framework, defining schemas or queries,
adding commands or authorization, integrating a frontend, or changing storage.
It documents the current public API, including advanced adapters and legacy APIs.
For a short SolidJS walkthrough, start with the [README](README.md#getting-started).

## Choose the relevant reference

| Work you are doing | Read |
| --- | --- |
| Tables, indexes, query syntax, live queries, transactions | [Schema, queries, and database](docs/api/database.md) |
| Authorization, commands, gateways, optimistic state, HTTP, SolidJS, compilation | [Application API](docs/api/application.md) |
| Memory/file/LMDB storage, snapshots, branches, retention, migrations, import | [Storage API](docs/api/storage.md) |
| Memory budgets, spill stores, B+ trees, page stores, caches, key encoding | [Runtime and adapter APIs](docs/api/runtime.md) |
| Finding an exact exported function or type and its source | [Complete export index](docs/api/exports.md) |
| Understanding how these components fit together | [Architecture](architecture.md) |

## Adoption sequence

1. **Define one shared model.** Export tables, the schema, and typed query values
   from a browser-safe module. Add indexes for frequently filtered relationship
   columns. Completion: the schema has a primary key on every table, and queries
   type-check with the intended result shape.
2. **Choose storage and ownership.** Use `openKeyValueStorage({ schema, directory })`
   for LMDB, `openNodeStorage` for file storage with migrations, or `memoryStorage`
   for a simple ephemeral database. Pass it to `await hydb.database(...)`.
   Completion: the owner has a shutdown path that awaits `database.close()`.
3. **Define authorization.** Share one principal Zod schema instance between
   policies, command factories, and gateways. Provide exactly one read and write
   policy per table. Completion: gateway construction succeeds and a second
   principal cannot read or mutate the first principal's protected records.
4. **Define application commands with HyApp.** Put input/output contracts and
   reusable optimistic mutations in shared command definitions. Keep authentication,
   secrets, and authoritative decisions on the server. Completion: invalid input,
   denied writes, and invalid output leave storage unchanged.
5. **Expose a gateway.** Bind direct sessions to trusted principals, or mount the
   HTTP handler with an application authentication resolver. Register stable
   command/query names. Completion: reads, subscriptions, and dispatch work
   through the gateway, rather than through unfiltered database access.
6. **Compile and connect the frontend.** Use client-target command definitions,
   HTTP transport, and Solid helpers or the framework-independent client.
   Completion: the browser bundle excludes server handlers and dependencies;
   query state updates after a command and subscriptions stop on disposal.
7. **Add optimism only with a coordinator.** Supply a local transaction layer,
   acknowledgement/rejection behavior, and integration of authoritative data.
   Completion: rejection removes the failed layer without losing other pending
   work, and confirmation does not apply a mutation twice.

## Imports and runtime boundaries

| Entry point | Use |
| --- | --- |
| `@hyos/hydb` | `hydb` builders, database, policies, memory storage, query plans, memory/spill contracts |
| `@hyos/hydb/node` | File and key-value persistence, LMDB, migrations, import, tree/cache adapters |
| `@hyos/hyapp` | Commands, registries, gateways, clients, optimistic lifecycle, direct transport |
| `@hyos/hyapp/compiler` | Build-time source transformation |
| `@hyos/hyapp/esbuild` | Build-time esbuild integration |
| `@hyos/hyapp/http` | Browser HTTP client and transport errors |
| `@hyos/hyapp/node` | Node HTTP request handler |
| `@hyos/hyapp/solid` | Solid query state and typed command dispatcher |
| `@hyos/hyapp/wire` | Serialization for transport values |

The export maps in the two package manifests define supported import paths.
Use `hydb.table`, `hydb.schema`, and `hydb.query`; those builders are not standalone
named exports. Scalar column builders such as `text` and `id` are named exports.
Use the `InferCommandInput`, `Gateway`, and related types from the package that
owns the command/gateway: HyDB's legacy types and HyApp's types are different.
Private source modules and their unexported helper types are implementation details.

Use Node.js 24 and build both workspace packages before consuming their exports.
The packages are private workspace packages; local checkout installation is shown
in the README. With linked packages, keep the application's Zod version aligned
with the checkout to avoid incompatible schema types. HyApp is ESM; HyDB also
exposes CommonJS entry points. Keep Node storage out of browser imports. The
current browser build needs `process.env.HYOS_BOOT_TRACE` replaced with `"0"`.

## Current boundaries that affect adoption

| Requirement | Current behavior |
| --- | --- |
| Frontend database and optimistic replication | Hooks and shared mutation logic are provided. The application supplies its local database integration, layer management, reconciliation, retries, and any offline queue. |
| HTTP exactly-once commands | Invocation IDs are carried, but the built-in adapters do not persist deduplication or automatically retry. A lost response can follow a committed write. |
| Query language | Equality/inequality, boolean composition, ordering, limits, nested correlated selections, and five cardinalities. No SQL strings or generic `join`, `groupBy`, `sum`, or field range-comparison methods. |
| Relationships | `.references()` records schema relationships. General foreign-key enforcement and cascading deletes are not implemented; enforce required invariants in commands/policies. |
| Branching | Low-level storage can create/read/write branches. The high-level `Database` uses `main`; it has no branch-selector option or branch merge API. |
| Key-value schema evolution | Reopening requires the same schema. Declarative migrations belong to the file engine. |
| Multiple storage instances | Use one active writer; key-value GC reader pins are instance-local. Stale-writer detection is not distributed subscription synchronization. |
| Resource budgets | Memory accounting and spill thresholds cover managed state, not a hard bound on process RSS or all native LMDB allocations. |
| Wire versus stored values | The transport codec supports more value types than the persistent row codec. Consult the storage value limits before persisting transport payloads directly. |

## Verification for an adopting application

Exercise an allowed read/write and a denied one using different principals. Verify
invalid input and failed output validation publish no changes. Test query
cardinality with zero, one, and multiple rows. For persistence, close and reopen
before asserting the saved rows. For a frontend, verify live updates from another
client and cleanup on unmount. For optimism, verify rejection, confirmation,
overlapping commands, and reordered responses/live results in the application's
coordinator.

The reference snippets use a shared example model defined in
[Schema, queries, and database](docs/api/database.md#example-model). Code blocks
are labeled by module or describe the variables they expect; they are not a
single concatenated program. The export index accounts for every named export
from all nine package entry points, including type-only exports; returned builder
methods are covered in the corresponding reference sections.
