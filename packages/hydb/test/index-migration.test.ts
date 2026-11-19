import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  hydb,
  id,
  index,
  integer,
  storageMutation,
  text,
  uniqueIndex,
} from "../src/index.js";
import {
  applySchemaChanges,
  ddl,
  defineMigration,
  describeSchema,
  diffSchemaDescriptions,
  openNodeStorage,
  reverseSchemaChanges,
} from "../src/node/index.js";

const v1 = hydb.table(
  "mindex_events",
  { id: id().primaryKey(), sessionId: text().notNull(), sequence: integer().notNull() },
  (c) => [index("mindex_session").on(c.sessionId)],
);
const v2 = hydb.table(
  "mindex_events",
  { id: id().primaryKey(), sessionId: text().notNull(), sequence: integer().notNull() },
  (c) => [index("mindex_session_sequence").on(c.sessionId, c.sequence)],
);
const v1Schema = hydb.schema({ events: v1 });
const v2Schema = hydb.schema({ events: v2 });
const v1Index = describeSchema(v1Schema)[0]!.indexes[0]!;
const migrations = [
  defineMigration({
    id: "0001-session-sequence",
    steps: [ddl.dropIndex("mindex_events", v1Index), ddl.addIndex(v2, "mindex_session_sequence")],
  }),
];

test("index ops apply, reverse and are produced by the schema diff", () => {
  const from = describeSchema(v1Schema), to = describeSchema(v2Schema);
  const ops = migrations[0]!.steps as Parameters<typeof applySchemaChanges>[1];
  assert.deepEqual(applySchemaChanges(from, ops), to);
  assert.deepEqual(reverseSchemaChanges(to, ops), from);
  const diff = diffSchemaDescriptions(from, to);
  assert.deepEqual(diff.map((op) => op.type), ["dropIndex", "addIndex"]);
  assert.deepEqual(applySchemaChanges(from, diff), to);
  assert.deepEqual(reverseSchemaChanges(to, diff), from);
});

test("a migration builds a new index over existing rows and drops the old one", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hydb-index-migration-"));
  try {
    let storage = await openNodeStorage({ directory, schema: v1Schema });
    await storage.commit({
      branch: "main",
      expectedHead: await storage.head(),
      mutations: ["a", "b"].flatMap((sessionId) =>
        [3, 1, 2].map((sequence) =>
          storageMutation.insert(v1, { id: `${sessionId}-${sequence}`, sessionId, sequence }),
        ),
      ),
    });
    await storage.close();

    storage = await openNodeStorage({ directory, schema: v2Schema, migrations });
    const db = await hydb.database({ schema: v2Schema, storage });
    const rows = await db.fetch(
      hydb
        .query(v2)
        .where((row) => row.sessionId.eq("b").and(row.sequence.gt(1)))
        .orderBy((row) => row.sequence.asc())
        .many(),
    );
    assert.deepEqual(rows.map((row) => row.id), ["b-2", "b-3"]);
    // New writes maintain the migrated index (the database owns the storage).
    await storage.commit({
      branch: "main",
      expectedHead: await storage.head(),
      mutations: [storageMutation.insert(v2, { id: "b-4", sessionId: "b", sequence: 4 })],
    });
    const scanned = [];
    const snapshot = await storage.snapshot();
    for await (const batch of snapshot.scan({
      type: "index",
      table: v2,
      index: "mindex_session_sequence",
      key: ["b"],
    })) scanned.push(...batch.map((row) => row.id));
    assert.deepEqual(scanned, ["b-1", "b-2", "b-3", "b-4"]);
    await snapshot.close();
    await db.close();

    // Reopening at the migrated schema runs nothing further.
    storage = await openNodeStorage({ directory, schema: v2Schema, migrations });
    await storage.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("adding a unique index rejects existing duplicates", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hydb-index-migration-"));
  const unique = hydb.table(
    "mindex_events",
    { id: id().primaryKey(), sessionId: text().notNull(), sequence: integer().notNull() },
    (c) => [index("mindex_session").on(c.sessionId), uniqueIndex("mindex_unique_session").on(c.sessionId)],
  );
  try {
    let storage = await openNodeStorage({ directory, schema: v1Schema });
    await storage.commit({
      branch: "main",
      expectedHead: await storage.head(),
      mutations: [1, 2].map((sequence) =>
        storageMutation.insert(v1, { id: `a-${sequence}`, sessionId: "a", sequence }),
      ),
    });
    await storage.close();
    await assert.rejects(
      openNodeStorage({
        directory,
        schema: hydb.schema({ events: unique }),
        migrations: [defineMigration({ id: "0001-unique", steps: [ddl.addIndex(unique, "mindex_unique_session")] })],
      }),
      /rejected a duplicate key/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
