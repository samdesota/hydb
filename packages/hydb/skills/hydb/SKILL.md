---
name: hydb
description: Build or modify applications using @438d/hydb. Use for HyDB schemas, typed queries, live subscriptions, transactions, row policies, and persistent storage. For application commands, HTTP gateways, or UI clients, use the HyApp guidance as well.
license: MIT
---

# HyDB

HyDB owns schemas, queries, transactions, policy primitives, and storage.
Use `@438d/hydb` for the database API and `@438d/hydb/node` for persistent
storage and migrations. Both entry points support ESM and CommonJS. The npm
packages require Node.js 24.11 or newer; keep Node-only imports out of browser
modules.

## Choose the relevant reference

- Defining tables, indexes, nested queries, or subscriptions: read
  [schema-and-queries.md](references/schema-and-queries.md).
- Adding row authorization or changing ownership rules: read
  [policies.md](references/policies.md).
- Opening storage, writing transactions, or configuring lifecycle and memory:
  read [storage-and-transactions.md](references/storage-and-transactions.md).
- Changing persistent schemas, importing a file database, or reclaiming history:
  read [persistence.md](references/persistence.md).

Adapt the examples to the application's existing tables and principal. Each
reference states which example values it assumes; snippets are not a complete
application unless marked as such. For signatures beyond these examples,
inspect the installed package's `dist/src/*.d.ts` and `dist/src/node/*.d.ts`.

## Preserve these API boundaries

- Tables require primary keys. Keys passed to transaction `get`, `update`, and
  `delete` are arrays, such as `[taskId]`.
- Finish a query with `.many()`, `.one()`, or `.count()`. Queries are reusable
  values accepted by `fetch` and `subscribe`; they are not SQL strings.
- Raw database reads have no principal and no read-policy filtering. Use a
  principal-bound HyApp gateway for user-facing access. Low-level
  `storage.commit` also bypasses application write policies.
- Reuse the same Zod principal schema instance across read policies, write
  policies, command factories, and gateways. A policy set needs exactly one
  policy per table. Check both the before and after row for ownership changes.
- Await transaction operations and keep transaction objects inside their
  callback. Conflicting writes are rejected; handlers are not automatically
  rerun. Prefer HyApp commands when defining application mutations.
- Choose storage deliberately: `memoryStorage` is ephemeral;
  `openNodeStorage` is the file engine with migrations;
  `openKeyValueStorage` uses LMDB by default and currently requires the same
  schema on reopen. File-to-LMDB import is a separate offline operation.
- Dispose subscriptions and snapshots. `database.close()` closes its storage.
  Garbage collection is explicit and LMDB reader protection is local to the
  storage instance.
- Browser bundles using the database currently need
  `process.env.HYOS_BOOT_TRACE` replaced with the string literal `"0"` by their
  bundler; this is a trace flag, not application configuration.

## Check the behavior you change

For query or transaction changes, exercise the result and a subsequent live
update. For policy changes, use two principals and check both allowed and denied
reads/writes. For persistence changes, close and reopen a temporary database
with the chosen engine. Do not treat an in-memory check as proof of persistence
or migration support.
