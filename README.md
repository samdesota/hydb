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

See [Architecture](architecture.md) for a diagrammed overview of the core components, query and command flows, and storage engines.

## Getting started

Build a browser task list backed by LMDB. The frontend uses typed queries and
commands through a HyApp client; the server owns persistence and authorization.
Creating or completing a task updates every open tab through a live subscription.
This example uses plain TypeScript and DOM APIs so no UI framework is required.

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

Create the six files below inside `getting-started/`. Each code block is a
complete file; the final step builds the client and server and starts the app.

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
subscriptions, and commands. Serving the page and gateway together keeps browser
requests on the same origin.

This localhost demo assigns Alice to every request. In your application, replace
the `principal` callback with a lookup that verifies your session cookie or token
and returns the authenticated user; the browser does not choose its own principal.

```ts
// getting-started/server.ts
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
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

const clientScript = await readFile(new URL("./client.js", import.meta.url));
const html = `<!doctype html>
<html lang="en"><meta charset="utf-8"><title>HyDB tasks</title>
<body><h1>My tasks</h1>
<form id="add-task"><input id="title" aria-label="Task title" required maxlength="200">
<button id="add">Add task</button></form>
<p id="status" role="status">Loading tasks…</p><ul id="tasks"></ul>
<script type="module" src="/client.js"></script></body></html>`;

const server = createServer(async (request, response) => {
  if (await handleGateway(request, response)) return;
  if (request.url === "/client.js") {
    response.writeHead(200, { "content-type": "text/javascript" }).end(clientScript);
  } else if (request.url === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html);
  } else {
    response.writeHead(404).end();
  }
});
server.listen(3000, "127.0.0.1", () => console.log("Open http://127.0.0.1:3000"));

async function shutdown() {
  const closed = new Promise<void>((resolve) => server.close(() => resolve()));
  server.closeAllConnections(); // Includes active streaming subscriptions.
  await closed;
  await database.close();
}
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
```

### 6. Read and write from the frontend

`gatewayClient` provides the frontend API. `client.subscribe(taskList, ...)`
delivers the initial rows and live updates. `client.dispatch(...)` sends typed
commands to the gateway. The UI renders the subscription results, so it updates
when another tab changes the database too.

```ts
// getting-started/client.ts
import { hyapp } from "@hyos/hyapp";
import { httpGatewayTransport } from "@hyos/hyapp/http";
import { reads, taskList } from "./model.js";
import { registry } from "./commands.js";

// The client build transforms registry into client command definitions.
const client = hyapp.gatewayClient({
  registry,
  transport: httpGatewayTransport({ reads, baseUrl: "/api/hyapp" }),
});

const form = document.querySelector<HTMLFormElement>("#add-task")!;
const title = document.querySelector<HTMLInputElement>("#title")!;
const add = document.querySelector<HTMLButtonElement>("#add")!;
const list = document.querySelector<HTMLUListElement>("#tasks")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const showError = (error: unknown) => {
  status.textContent = error instanceof Error ? error.message : String(error);
};

// subscribe delivers both the initial result and future committed changes.
const unsubscribe = client.subscribe(taskList, (rows) => {
  status.textContent = rows.length === 0 ? "No tasks yet." : "";
  list.replaceChildren(...rows.map((task) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.textContent = task.done ? `${task.title} — done` : task.title;
    button.disabled = task.done;
    button.onclick = async () => {
      button.disabled = true;
      try {
        await client.dispatch("completeTask", { id: task.id });
      } catch (error) {
        showError(error);
        button.disabled = false;
      }
    };
    item.append(button);
    return item;
  }));
}, showError);

form.onsubmit = async (event) => {
  event.preventDefault();
  add.disabled = true;
  try {
    await client.dispatch("createTask", { title: title.value });
    title.value = "";
  } catch (error) {
    showError(error);
  } finally {
    add.disabled = false;
  }
};
window.addEventListener("pagehide", () => unsubscribe(), { once: true });
```

For a one-time read, use `await client.fetch(taskList)`. In a component-based UI,
call the subscription's disposer when the component unmounts. For SolidJS,
[`createGatewayQuery` and `createCommandDispatcher`](packages/hyapp/README.md#solidjs-helpers)
provide query state, cleanup, and reactive pending state.

This example displays committed updates. Optimistic local changes require an
`OptimisticCoordinator`; the HTTP client does not automatically create a local
replica.

### 7. Build and run both sides

The command plugin produces separate client and server command definitions.
The browser gets contracts and any optimistic handlers; server handlers and
policy dependencies stay in the server build. The `define` setting disables the
database's Node-oriented trace flag in the browser bundle.

```js
// getting-started/build.mjs
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { hyappCommandsPlugin } from "@hyos/hyapp/esbuild";

const shared = {
  absWorkingDir: fileURLToPath(new URL(".", import.meta.url)),
  bundle: true,
  format: "esm",
};
await build({
  ...shared,
  entryPoints: ["server.ts"],
  platform: "node",
  packages: "external",
  plugins: [hyappCommandsPlugin({ target: "server" })],
  outfile: "dist/server.mjs",
});
await build({
  ...shared,
  entryPoints: ["client.ts"],
  platform: "browser",
  plugins: [hyappCommandsPlugin({ target: "client" })],
  define: { "process.env.HYOS_BOOT_TRACE": '"0"' },
  outfile: "dist/client.js",
});
```

Run these commands from the repository root:

```sh
node getting-started/build.mjs
node getting-started/dist/server.mjs
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000), add a task, and click it to mark
it done. Open a second tab to see live updates. Restart the server and reload to
see that tasks persist in `./.data/getting-started`. Stop the server with Ctrl+C
so subscriptions and storage are closed.

For isolated tests, the same key-value engine accepts `store: memoryKeyValueStore()`
instead of `directory`; import the adapter from `@hyos/hydb/node`. The LMDB engine
currently requires the same schema when reopening; general schema migrations are
not yet supported by this backend. See [key-value storage](packages/hydb/KEY_VALUE_PROTOTYPE.md)
for retention and garbage collection.

### Use it in an existing project

After building this checkout, install both local packages in your project,
replacing `/absolute/path/to/hydb` with the checkout path:

```sh
npm install --save-exact /absolute/path/to/hydb/packages/hydb /absolute/path/to/hydb/packages/hyapp zod@4.4.3
npm install --save-dev esbuild@0.28.2
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
