# HyDB

HyDB is a JavaScript-based real-time database system and application framework,
with typed APIs for defining schemas, queries, and application behavior. It uses
differential dataflow to incrementally maintain materialized query results as
rows change, enabling fast, live updates without repeatedly recomputing entire
queries. Its HyApp layer adds an authorization framework that expresses who can
read and change each table, applies those rules through principal-bound gateways,
and keeps access control alongside the application's data model.

For optimistic applications, the design supports a two-database model: a frontend
database provides immediate local reads and writes, while a backend database
remains authoritative and durable. Commands let you define optimistic mutation
logic once and reuse it on both sides, with server-only validation and policies
kept out of the browser build. The UI can respond immediately, then reconcile
with confirmed server results or roll back a rejected change. HyApp supplies the
shared command compilation and optimistic lifecycle hooks; the application
supplies the frontend database integration and coordinator that manages local
layers, authoritative updates, and reconciliation.

## Repo Structure

A TypeScript monorepo containing:

- `packages/hydb`: schemas, queries, transactions, live subscriptions, and persistent storage.
- `packages/hyapp`: application gateways, commands, HTTP transport, and optional SolidJS bindings built on HyDB.

Package names remain `@hyos/hydb` and `@hyos/hyapp` so existing imports keep working.

For agent-guided adoption and the full public API, see the [Usage reference](usage.md).

See [Architecture](architecture.md) for a diagrammed overview of the core components, query and command flows, and storage engines.

## Getting started

Build a browser task list backed by LMDB. The frontend uses typed queries and
commands through a HyApp client; the server owns persistence and authorization.
Creating or completing a task updates every open tab through a live subscription.
The frontend example uses SolidJS to keep live query state and command dispatch
concise.

```text
Browser UI → HyApp client → HTTP gateway → HyDB → LMDB
Browser UI ← live query results ← committed changes
```

### 1. Build the packages

Use Node.js 24. These are currently private workspace packages, so start with a
local checkout:

```sh
git clone https://github.com/samdesota/hydb.git
cd hydb
npm ci
npm run build
mkdir getting-started
```

The snippets below show the data layer and a SolidJS component. Place the shared
modules in `getting-started/` and use the component in your Solid app. Normal app
scaffolding, routing, and error displays are omitted to keep the flow clear.

### 2. Share the schema and queries

Both builds use the same schema and query definitions. Each task belongs to a
user, and an index supports reads restricted to that owner. The read registry
gives the HTTP gateway stable query names.

```ts
// getting-started/model.ts
import { boolean, hydb, id, index, text } from "@hyos/hydb";
import { hyapp } from "@hyos/hyapp";

export const tasks = hydb.table(
  "tasks",
  {
    id: id().primaryKey(),
    ownerId: id().notNull(),
    title: text().notNull(),
    done: boolean().notNull().default(false),
  },
  (columns) => [index("tasks_owner_idx").on(columns.ownerId)],
);

export const schema = hydb.schema({ tasks });

export const taskList = hydb
  .query(tasks)
  .orderBy((task) => task.title.asc())
  .select((task) => ({ id: task.id, title: task.title, done: task.done }))
  .many();

// Stable names for queries exposed over HTTP.
export const reads = hyapp.gatewayReadRegistry({ tasks: taskList });
```

### 3. Keep authorization on the server

Define a read policy and a write policy for every table. Reuse the same principal
schema for policies, commands, and the gateway. Checking both sides of an update
also prevents moving a task to another owner.

```ts
// getting-started/policies.server.ts
import { hydb } from "@hyos/hydb";
import { z } from "zod";
import { tasks } from "./model.js";

export const principal = z.object({ userId: z.string().min(1) });
const reads = hydb.readPolicy(principal);
const writes = hydb.writePolicy(principal);

export const readPolicies = [
  reads.where(tasks, ({ row, principal }) =>
    row.ownerId.eq(principal.userId),
  ),
];

export const writePolicies = [
  writes.where(tasks, ({ change, principal }) => {
    const ownedBefore =
      change.kind === "insert" || change.before.ownerId === principal.userId;
    const ownedAfter =
      change.kind === "delete" || change.after.ownerId === principal.userId;
    return ownedBefore && ownedAfter;
  }),
];
```

### 4. Define the commands once

Commands validate input and run their writes in a transaction. The server chooses
the new task's owner from the authenticated principal. The browser imports this
same registry, but the client build removes server handlers and their dependencies,
including `node:crypto` and the policy module.

```ts
// getting-started/commands.ts
import { randomUUID } from "node:crypto";
import { hyapp } from "@hyos/hyapp";
import { z } from "zod";
import { tasks } from "./model.js";
import { principal, writePolicies } from "./policies.server.js";

const commands = hyapp.commandFactory({
  principal,
  defaultPolicy: writePolicies,
});

const createTask = commands.define({
  input: z.object({ title: z.string().trim().min(1).max(200) }),
  output: z.object({ id: z.string() }),
  async server({ transaction, principal }, input) {
    const taskId = randomUUID();
    await transaction.insert(tasks, {
      id: taskId,
      ownerId: principal.userId,
      title: input.title,
    });
    return { id: taskId };
  },
});

const completeTask = commands.define({
  input: z.object({ id: z.string() }),
  async server({ transaction }, input) {
    await transaction.update(tasks, [input.id], { done: true });
  },
});

export const registry = hyapp.commandRegistry({ createTask, completeTask });
```

### 5. Serve the gateway with key-value storage

`openKeyValueStorage({ directory, schema })` selects LMDB and reopens the same
stored data on later runs. The HTTP handler exposes the registered queries,
subscriptions, and commands. Mount it in your Node server and serve or proxy
`/api/hyapp` on the same origin as your Solid app.

This localhost demo assigns Alice to every request. In your application, replace
the `principal` callback with a lookup that verifies your session cookie or token
and returns the authenticated user; the browser does not choose its own principal.

```ts
// getting-started/server.ts
import { createServer } from "node:http";
import { hydb } from "@hyos/hydb";
import { openKeyValueStorage } from "@hyos/hydb/node";
import { hyapp } from "@hyos/hyapp";
import { createNodeGatewayHttpHandler } from "@hyos/hyapp/node";
import { schema, reads } from "./model.js";
import { registry } from "./commands.js";
import { principal, readPolicies } from "./policies.server.js";

const storage = await openKeyValueStorage({
  schema,
  directory: "./.data/getting-started",
});
const database = await hydb.database({ schema, storage });
const gateway = hyapp.gateway({ database, principal, registry, readPolicies });
const handleGateway = createNodeGatewayHttpHandler({
  gateway,
  reads,
  // Local demo identity. Replace with your verified session/token lookup.
  principal: () => ({ userId: "alice" }),
});

const server = createServer(async (request, response) => {
  if (await handleGateway(request, response)) return;
  response.writeHead(404).end();
});
server.listen(3001, "127.0.0.1");

async function shutdown() {
  const closed = new Promise<void>((resolve) => server.close(() => resolve()));
  server.closeAllConnections(); // Includes active streaming subscriptions.
  await closed;
  await database.close();
}
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
```

### 6. Use the database from SolidJS

`createGatewayQuery` gives the component live data, loading state, and automatic
subscription cleanup. `createCommandDispatcher` sends typed commands and tracks
pending state. The component updates when a command changes the database,
including changes made in another tab.

```tsx
// getting-started/Tasks.tsx
import { createSignal, For, Show } from "solid-js";
import { hyapp } from "@hyos/hyapp";
import { httpGatewayTransport } from "@hyos/hyapp/http";
import { createCommandDispatcher, createGatewayQuery } from "@hyos/hyapp/solid";
import { reads, taskList } from "./model.js";
import { registry } from "./commands.js";

const client = hyapp.gatewayClient({
  registry,
  transport: httpGatewayTransport({ reads }),
});

export default function Tasks() {
  const tasks = createGatewayQuery(client, taskList);
  const dispatch = createCommandDispatcher(client);
  const [title, setTitle] = createSignal("");

  async function addTask() {
    await dispatch("createTask", { title: title() });
    setTitle("");
  }

  return (
    <section>
      <input
        placeholder="New task"
        value={title()}
        onInput={(event) => setTitle(event.currentTarget.value)}
      />
      <button disabled={!title().trim() || dispatch.isPending("createTask")} onClick={addTask}>
        Add task
      </button>

      <Show when={!tasks.loading()} fallback={<p>Loading tasks…</p>}>
        <For each={tasks.data()}>
          {(task) => (
            <button
              disabled={task.done || dispatch.isPending("completeTask")}
              onClick={() => dispatch("completeTask", { id: task.id })}
            >
              {task.title}{task.done ? " — done" : ""}
            </button>
          )}
        </For>
      </Show>
    </section>
  );
}
```

Mount `<Tasks />` in your Solid app. There is no manual fetch-and-refresh loop:
`tasks.data()` stays current through the live subscription. Use `tasks.error()`
and handle rejected dispatches in your app's error UI.

This example displays committed updates. Optimistic local changes require an
`OptimisticCoordinator`; the HTTP client does not automatically create a local
replica.

### 7. Connect the builds

Use your Solid app's normal JSX build. Run HyApp's command transform with
`target: "client"` **before** the Solid transform so the imported registry contains
client contracts, with server handlers and policy dependencies removed. Compile
server commands with `target: "server"`. The [build integration guide](packages/hyapp/usage.md#7-compile-shared-commands-for-client-and-server)
shows the esbuild plugin and the transform hook for tools such as Vite.

In a Vite development setup, proxy `/api` to `http://127.0.0.1:3001`. Also set
`define: { "process.env.HYOS_BOOT_TRACE": '"0"' }` in the browser build to disable
Node-oriented trace logging. Keep LMDB and `server.ts` in the backend build.

For isolated tests, the same key-value engine accepts `store: memoryKeyValueStore()`
instead of `directory`; import the adapter from `@hyos/hydb/node`. The LMDB engine
currently requires the same schema when reopening; general schema migrations are
not yet supported by this backend. See [key-value storage](packages/hydb/KEY_VALUE_PROTOTYPE.md)
for retention and garbage collection.

### Use it in an existing project

After building this checkout, install both local packages in your project,
replacing `/absolute/path/to/hydb` with the checkout path:

```sh
npm install --save-exact /absolute/path/to/hydb/packages/hydb /absolute/path/to/hydb/packages/hyapp zod@4.4.3 solid-js@1.9.15
```

Keep Zod aligned with the checkout so schema types match across packages. Keep the
built checkout available: npm links local directory dependencies. Reuse the
client/server split above, mount the gateway in your server, and point the browser
transport at it. The [HyApp usage guide](packages/hyapp/usage.md) covers other
build tools, HTTP integration, and SolidJS helpers.

## Development

Use Node.js 24 and npm. From the repository root:

```sh
npm ci
npm run build
npm run typecheck
npm test
```

Run `npm run sandbox` to generate the HyDB query planner sandbox. See [HyApp usage](packages/hyapp/README.md) and [storage benchmarks](packages/hydb/benchmarks/README.md).

## History

This repository preserves the original HyDB and HyApp changes extracted from HyOS, with unrelated changes removed. See [extraction details](docs/extraction.md) and the [original-to-extracted commit map](docs/history/commit-map.tsv).
