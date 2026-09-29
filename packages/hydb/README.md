# @438d/hydb

A typed real-time database with incremental queries, live subscriptions,
transactions, and persistent Node.js storage.

## Installation

Requires Node.js 24.11 or newer.

```sh
npm install @438d/hydb
```

## Quick start

```js
import { hydb, id, memoryStorage, storageMutation, text } from "@438d/hydb";

const tasks = hydb.table("tasks", {
  id: id().primaryKey(),
  title: text().notNull(),
});
const schema = hydb.schema({ tasks });
const storage = await memoryStorage({ schema });
await storage.commit({
  expectedVersion: 0,
  mutations: [storageMutation.insert(tasks, { id: "1", title: "Try HyDB" })],
});

const db = await hydb.database({ schema, storage });
console.log(await db.fetch(hydb.query(tasks).many()));
await db.close();
```

The main entry point provides schemas, queries, transactions, subscriptions,
policies, and in-memory storage. Import persistent storage adapters from
`@438d/hydb/node`. Both entry points support ESM and CommonJS and include
TypeScript declarations.

For application commands, HTTP gateways, client/server compilation, and optional
SolidJS bindings, install `@438d/hyapp` as well.

See the [full getting-started guide](https://github.com/samdesota/hydb#readme)
and [architecture](https://github.com/samdesota/hydb/blob/main/architecture.md).

## Usage and agent instructions

The [HyDB skill](skills/hydb/SKILL.md) routes to focused references for schemas,
queries, policies, transactions, and persistence. These files ship with the npm
package. Ask your agent to read
`node_modules/@438d/hydb/skills/hydb/SKILL.md`, or copy the whole `skills/hydb`
folder into its supported skills directory. Package installation alone does not
register the skill with every agent.

## License

MIT
