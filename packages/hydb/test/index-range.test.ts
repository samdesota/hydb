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
  memoryStorage,
  planQuery,
  storageMutation,
  text,
  type StorageDatabase,
} from "../src/index.js";
import { openNodeStorage } from "../src/node/index.js";

const events = hydb.table(
  "events",
  {
    id: id().primaryKey(),
    sessionId: text().notNull(),
    sequence: integer().notNull(),
    kind: text().notNull(),
  },
  (columns) => [
    index("events_session_sequence_idx").on(columns.sessionId, columns.sequence),
  ],
);
const schema = hydb.schema({ events });

type Row = { id: string; sessionId: string; sequence: number; kind: string };
const rows: Row[] = [];
for (const sessionId of ["a", "b", "c"]) {
  for (let sequence = 1; sequence <= 40; sequence += 1) {
    rows.push({
      id: `${sessionId}-${String(sequence).padStart(3, "0")}`,
      sessionId,
      sequence,
      kind: sequence % 3 === 0 ? "tool" : "text",
    });
  }
}

test("a range on the column after an index's equality prefix bounds the scan", () => {
  const planned = planQuery(
    schema,
    hydb
      .query(events)
      .where((event) => event.sessionId.eq("a").and(event.sequence.gt(10)))
      .where((event) => event.sequence.lte(20))
      .orderBy((event) => event.sequence.asc())
      .limit(5)
      .many(),
  );
  assert.equal(planned.access.kind, "index-scan");
  assert.equal(planned.access.index, "events_session_sequence_idx");
  assert.deepEqual(planned.access.range, {
    lower: { inclusive: false, value: { kind: "literal", value: 10 } },
    upper: { inclusive: true, value: { kind: "literal", value: 20 } },
  });
  // The comparisons stay as filters; the range only narrows the scan.
  assert.equal(planned.filters.length, 2);
  assert.deepEqual(planned.order, []);
});

async function nodeStorage(directory: string): Promise<StorageDatabase> {
  return openNodeStorage({ directory, schema });
}

for (const [name, open] of [
  ["memory", async () => memoryStorage({ schema })],
  ["node", nodeStorage],
] as const) {
  test(`${name} storage index ranges match a full filter`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "hydb-index-range-"));
    const storage = await open(directory);
    try {
      const snapshot = await storage.snapshot();
      await storage.commit({
        expectedHead: snapshot.commit,
        mutations: rows.map((row) => storageMutation.insert(events, row)),
      });
      await snapshot.close();
      const db = await hydb.database({ schema, storage });
      const bounds = [undefined, 0, 1, 10, 25, 40, 41];
      for (const low of bounds) {
        for (const high of bounds) {
          for (const inclusive of [false, true]) {
            for (const direction of ["asc", "desc"] as const) {
              const result = await db.fetch(
                hydb
                  .query(events)
                  .where((event) => {
                    let condition = event.sessionId.eq("b");
                    if (low !== undefined) {
                      condition = condition.and(
                        inclusive ? event.sequence.gte(low) : event.sequence.gt(low),
                      );
                    }
                    if (high !== undefined) {
                      condition = condition.and(
                        inclusive ? event.sequence.lte(high) : event.sequence.lt(high),
                      );
                    }
                    return condition;
                  })
                  .orderBy((event) =>
                    direction === "asc" ? event.sequence.asc() : event.sequence.desc(),
                  )
                  .limit(7)
                  .many(),
              );
              const expected = rows
                .filter((row) => row.sessionId === "b")
                .filter((row) =>
                  low === undefined ? true : inclusive ? row.sequence >= low : row.sequence > low,
                )
                .filter((row) =>
                  high === undefined ? true : inclusive ? row.sequence <= high : row.sequence < high,
                )
                .sort((left, right) =>
                  direction === "asc" ? left.sequence - right.sequence : right.sequence - left.sequence,
                )
                .slice(0, 7);
              assert.deepEqual(
                result.map((row) => row.id),
                expected.map((row) => row.id),
                JSON.stringify({ name, low, high, inclusive, direction }),
              );
            }
          }
        }
      }
      await db.close();
    } finally {
      await storage.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
}
