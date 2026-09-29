# Storage and transactions

Use this reference when opening a database, writing through a transaction, or
choosing persistent storage. Examples use `appSchema` and `tasks` from
[schema-and-queries.md](schema-and-queries.md).

## Open storage and create the database

Use the Node storage adapter for a persistent backend:

This is the file engine; it supports ordered schema/data migrations. For LMDB
and storage-selection constraints, see [persistence.md](persistence.md).

```ts
import { hydb } from "@438d/hydb";
import { openNodeStorage } from "@438d/hydb/node";

const storage = await openNodeStorage({
  directory: "./data/project-app",
  schema: appSchema,
});

export const database = await hydb.database({
  schema: appSchema,
  storage,
  memory: { maxBytes: 128 * 1024 * 1024 },
});
```

For tests or ephemeral applications:

```ts
import { memoryStorage } from "@438d/hydb";

const storage = await memoryStorage({ schema: appSchema });
const database = await hydb.database({ schema: appSchema, storage });
```

The database exposes `fetch`, `subscribe`, `transact`, `memoryStats`, and
`close`. Direct database reads have no principal and therefore no read-policy
filter. `transact` is the lower-level policy-aware write API used underneath
HyApp commands.

Close the database during graceful shutdown:

```ts
await database.close();
```

## Write through a policy-aware transaction

For a backend operation below the HyApp command layer, pass the same
`principalSchema` and `writePolicies` defined in [policies.md](policies.md).
The target task and its parent project must already exist and be owned by the
authenticated user in this example:

```ts
await database.transact(
  {
    principalSchema,
    principal: { userId: "user-123" },
    defaultPolicy: writePolicies,
  },
  async (transaction) => {
    const task = await transaction.get(tasks, ["task-123"]);
    if (task === undefined) throw new Error("Task not found");
    await transaction.update(tasks, ["task-123"], { done: true });
  },
);
```

`get`, `insert`, `update`, and `delete` are asynchronous. Keys are arrays in
primary-key order. `update` takes a partial row; `storageMutation.update` is a
lower-level operation that takes the complete replacement row. Transactions
observe their own writes and commit atomically. Do not use a transaction after
its callback returns. A storage conflict rejects the operation rather than
rerunning the handler automatically.

Use HyApp commands for mutations that need input/output contracts, dispatch,
or an optimistic client implementation. The legacy `hydb.command` and
`database.execute` API remains available, but it is a separate interface from
HyApp's command factories and registries.

## Memory and browser use

`memory.maxBytes` budgets tracked database allocations; it is not a total
process-RSS cap. Inspect `database.memoryStats()` when tuning a workload.
Large transactions and other allocations can still use additional memory.

For browser builds, import the main package only, use in-memory storage when
appropriate, and configure the bundler to replace `process.env.HYOS_BOOT_TRACE`
with the literal string `"0"`. For example, esbuild accepts:

```js
define: { "process.env.HYOS_BOOT_TRACE": '"0"' }
```

The Node storage, importer, and disk-spill adapters are server-only.
