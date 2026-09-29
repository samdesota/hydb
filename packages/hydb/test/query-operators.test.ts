import assert from "node:assert/strict";
import test from "node:test";

import {
  hydb,
  id,
  integer,
  memoryStorage,
  storageMutation,
  text,
  timestamp,
} from "../src/index.js";

const items = hydb.table("operator_items", {
  id: id().primaryKey(),
  label: text().notNull(),
  score: integer().notNull(),
  dueAt: timestamp(),
  note: text(),
});

const schema = hydb.schema({ items });

const rows = [
  { id: "a", label: "alpha", score: 1, dueAt: null, note: null },
  {
    id: "b",
    label: "beta",
    score: 5,
    dueAt: new Date(Date.UTC(2024, 0, 1)),
    note: "kept",
  },
  {
    id: "c",
    label: "gamma",
    score: 10,
    dueAt: new Date(Date.UTC(2024, 5, 15)),
    note: "kept",
  },
];

test("gt, gte, lt, and lte filter numerically", async () => {
  const storage = await memoryStorage({ schema });
  await storage.commit({
    expectedVersion: 0,
    mutations: rows.map((row) => storageMutation.insert(items, row)),
  });
  const db = await hydb.database({ schema, storage });
  try {
    const labels = async (query: unknown) =>
      ((await db.fetch(query as never)) as Array<{ label: string }>).map(
        (row) => row.label,
      );

    assert.deepEqual(
      await labels(hydb.query(items).where((item) => item.score.gt(4)).many()),
      ["beta", "gamma"],
    );
    assert.deepEqual(
      await labels(hydb.query(items).where((item) => item.score.gte(5)).many()),
      ["beta", "gamma"],
    );
    assert.deepEqual(
      await labels(hydb.query(items).where((item) => item.score.lt(5)).many()),
      ["alpha"],
    );
    assert.deepEqual(
      await labels(hydb.query(items).where((item) => item.score.lte(5)).many()),
      ["alpha", "beta"],
    );
  } finally {
    await db.close();
  }
});

test("ordering operators compare strings and timestamps", async () => {
  const storage = await memoryStorage({ schema });
  await storage.commit({
    expectedVersion: 0,
    mutations: rows.map((row) => storageMutation.insert(items, row)),
  });
  const db = await hydb.database({ schema, storage });
  try {
    const labels = async (query: unknown) =>
      ((await db.fetch(query as never)) as Array<{ label: string }>).map(
        (row) => row.label,
      );

    assert.deepEqual(
      await labels(hydb.query(items).where((item) => item.label.gt("beta")).many()),
      ["gamma"],
    );
    // dueAt is null for "alpha"; null sorts lowest, so lte includes it.
    assert.deepEqual(
      await labels(
        hydb
          .query(items)
          .where((item) => item.dueAt.lte(new Date(Date.UTC(2024, 0, 1))))
          .many(),
      ),
      ["alpha", "beta"],
    );
    // gt excludes null values.
    assert.deepEqual(
      await labels(
        hydb
          .query(items)
          .where((item) => item.dueAt.gt(new Date(Date.UTC(2023, 11, 31))))
          .many(),
      ),
      ["beta", "gamma"],
    );
  } finally {
    await db.close();
  }
});

test("in matches any value in the provided array", async () => {
  const storage = await memoryStorage({ schema });
  await storage.commit({
    expectedVersion: 0,
    mutations: rows.map((row) => storageMutation.insert(items, row)),
  });
  const db = await hydb.database({ schema, storage });
  try {
    const labels = async (query: unknown) =>
      ((await db.fetch(query as never)) as Array<{ label: string }>).map(
        (row) => row.label,
      );

    assert.deepEqual(
      await labels(
        hydb
          .query(items)
          .where((item) => item.label.in(["alpha", "gamma"]))
          .many(),
      ),
      ["alpha", "gamma"],
    );
    assert.deepEqual(
      await labels(hydb.query(items).where((item) => item.score.in([7])).many()),
      [],
    );
  } finally {
    await db.close();
  }
});

test("null sorts lowest for ordering operators", async () => {
  const storage = await memoryStorage({ schema });
  await storage.commit({
    expectedVersion: 0,
    mutations: rows.map((row) => storageMutation.insert(items, row)),
  });
  const db = await hydb.database({ schema, storage });
  try {
    const labels = async (query: unknown) =>
      ((await db.fetch(query as never)) as Array<{ label: string }>).map(
        (row) => row.label,
      );

    // note is null for "alpha": excluded by gt, included by lte, never matched by in.
    assert.deepEqual(
      await labels(hydb.query(items).where((item) => item.note.gt("a")).many()),
      ["beta", "gamma"],
    );
    assert.deepEqual(
      await labels(hydb.query(items).where((item) => item.note.lte("a")).many()),
      ["alpha"],
    );
    assert.deepEqual(
      await labels(
        hydb.query(items).where((item) => item.note.in(["kept"])).many(),
      ),
      ["beta", "gamma"],
    );
  } finally {
    await db.close();
  }
});
