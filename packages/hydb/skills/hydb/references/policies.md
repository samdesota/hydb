# Principal schemas and policies

Use this reference for row-level read and write authorization. Examples use
`users`, `projects`, and `tasks` from [schema-and-queries.md](schema-and-queries.md).
Import `hydb` from `@438d/hydb` and keep policy definitions in server modules.

## Define the authenticated principal

The same Zod schema instance is used by read policies, write policies, command
factories, and the gateway. This is intentional: startup validation rejects a
policy or command created for a different principal schema.

```ts
import { z } from "zod";

export const principalSchema = z.object({
  userId: z.string().min(1),
});

export type Principal = z.output<typeof principalSchema>;
```

Authentication is outside HyApp. An HTTP adapter converts an authenticated
request into this principal before binding a gateway session.

## Define read policies

Policies are row filters applied by the gateway before a query reaches the
database. Define exactly one read policy for every table in the schema.

```ts
const reads = hydb.readPolicy(principalSchema);

export const readPolicies = Object.freeze([
  reads.allowAll(users),
  reads.where(projects, ({ row, principal }) =>
    row.ownerId.eq(principal.userId),
  ),
  reads.through(tasks, projects, {
    from: tasks.projectId,
    to: projects.id,
  }),
]);
```

This means:

- every authenticated principal can read users;
- a principal can read only projects they own; and
- a task is readable only through its readable parent project.

`allowAll(table)` and `denyAll(table)` are explicit. `where(table, predicate)`
adds a principal-dependent expression. `through(child, parent, relationship)`
inherits access from a parent whose target is its single-column primary key.

Policy enforcement is fail-closed: missing, duplicate, out-of-schema, or
principal-mismatched policies reject gateway construction. A nested task query
correlated to an already authorized project can reuse that authorization fact;
the planner does not need to emit a redundant existence check for every task.

Do not call `database.fetch` with user-controlled queries. Raw database access
is intentionally unfiltered; user-facing reads must go through a gateway
session.

## Define write policies

Every command factory has a default write-policy set. As with reads, define
exactly one policy for every table.

```ts
const writes = hydb.writePolicy(principalSchema);

export const writePolicies = Object.freeze([
  writes.denyAll(users),
  writes.where(projects, ({ change, principal }) => {
    const ownedBefore =
      change.kind === "insert" || change.before.ownerId === principal.userId;
    const ownedAfter =
      change.kind === "delete" || change.after.ownerId === principal.userId;
    return ownedBefore && ownedAfter;
  }),
  writes.through(tasks, projects, {
    from: tasks.projectId,
    to: projects.id,
  }),
]);
```

A `where` write policy receives `{ change, principal, db }` and may be async.
`change` is one of `{ kind: "insert", after }`,
`{ kind: "update", before, after }`, or `{ kind: "delete", before }`.
`db.get(table, key)` can perform an authorization read against the transaction
snapshot.

The project policy checks both sides of an update, preventing an owner from
using an otherwise-authorized update to transfer ownership. Task mutations
inherit authorization from their parent project.
