import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
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
  type StorageDatabase,
  type StorageSnapshot,
} from "../src/index.js";
import {
  data,
  ddl,
  defaultRetention,
  defineMigration,
  openKeyValueStorage,
  openNodeStorage,
  openStorage,
  type FileMigrationReport,
  type Migration,
} from "../src/node/index.js";

const notesV1 = hydb.table("lm_notes", {
  id: id().primaryKey(),
  title: text().notNull(),
});
const schemaV1 = hydb.schema({ notes: notesV1 });

const notes = hydb.table(
  "lm_notes",
  {
    id: id().primaryKey(),
    title: text().notNull(),
    words: integer(),
  },
  (c) => [index("by_title").on(c.title)],
);
const tags = hydb.table("lm_tags", {
  id: id().primaryKey(),
  noteId: id().notNull(),
});
const schema = hydb.schema({ notes, tags });

function migrationsWith(
  countWords: (title: string) => number = (title) => title.split(" ").length,
): Migration[] {
  return [
    defineMigration({
      id: "0001-words",
      steps: [
        ddl.addColumn("lm_notes", "words", integer()),
        data(async (db) => {
          for await (const row of db.scan("lm_notes"))
            await db.update("lm_notes", [row.id as string], {
              words: countWords(row.title as string),
            });
        }),
      ],
    }),
    defineMigration({
      id: "0002-tags-and-index",
      steps: [ddl.addTable(tags), ddl.addIndex(notes, "by_title")],
    }),
  ];
}

const rows = async (
  snapshot: StorageSnapshot,
  table: typeof notes | typeof notesV1 | typeof tags = notes,
) => {
  const found: Record<string, unknown>[] = [];
  for await (const batch of snapshot.scan({ type: "table", table }))
    found.push(...batch);
  return found;
};

async function seed(
  storage: StorageDatabase,
  titles: readonly string[],
) {
  const committed = await storage.commit({
    expectedHead: await storage.head(),
    mutations: titles.map((title, i) =>
      storageMutation.insert(notesV1, { id: `n${i}`, title }),
    ),
  });
  await storage.createBranch({ name: "work", from: committed.commit });
}

const sha256 = async (path: string) =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex");

test("LMDB storage applies schema and data migrations to every branch", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hydb-lmdb-migrate-"));
  try {
    let storage = await openKeyValueStorage({ directory, schema: schemaV1 });
    await seed(storage, ["one", "two words", "three more words"]);
    const before = await storage.head();
    await storage.close();

    storage = await openKeyValueStorage({
      directory,
      schema,
      migrations: migrationsWith(),
    });
    for (const branch of ["main", "work"]) {
      const snapshot = await storage.snapshot({ branch });
      assert.deepEqual(
        (await rows(snapshot)).map((row) => row.words),
        [1, 2, 3],
      );
      const indexed: unknown[] = [];
      for await (const batch of snapshot.scan({
        type: "index",
        table: notes,
        index: "by_title",
        key: ["two words"],
      }))
        indexed.push(...batch);
      assert.deepEqual(indexed.map((row) => (row as { id: string }).id), [
        "n1",
      ]);
      await snapshot.close();
    }
    // History from before the migration stays readable.
    const old = await storage.snapshot({ commit: before });
    assert.equal((await rows(old)).length, 3);
    await old.close();
    const replayed: number[] = [];
    for await (const batch of storage.changes({
      after: 0,
      signal: AbortSignal.timeout(500),
    })) {
      replayed.push(batch.sequence);
      if (replayed.length === 5) break;
    }
    assert.deepEqual(replayed, [1, 2, 3, 4, 5]);
    await storage.commit({
      expectedHead: await storage.head(),
      mutations: [storageMutation.insert(tags, { id: "t1", noteId: "n0" })],
    });
    await storage.close();

    // Reopening at the final schema applies nothing further.
    storage = await openKeyValueStorage({
      directory,
      schema,
      migrations: migrationsWith(() => {
        throw new Error("must not rerun");
      }),
    });
    const snapshot = await storage.snapshot();
    assert.equal((await rows(snapshot, tags)).length, 1);
    await snapshot.close();
    await storage.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("LMDB storage rejects an undeclared schema change without writing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hydb-lmdb-undeclared-"));
  try {
    let storage = await openKeyValueStorage({ directory, schema: schemaV1 });
    await seed(storage, ["one"]);
    await storage.close();
    await assert.rejects(
      openKeyValueStorage({ directory, schema }),
      /declare the change in migrations/,
    );
    storage = await openKeyValueStorage({ directory, schema: schemaV1 });
    assert.equal((await rows(await storage.snapshot(), notesV1)).length, 1);
    await storage.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("an interrupted LMDB migration resumes at the step that never published", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hydb-lmdb-resume-"));
  try {
    let storage = await openKeyValueStorage({ directory, schema: schemaV1 });
    await seed(storage, ["one", "two words"]);
    await storage.close();
    await assert.rejects(
      openKeyValueStorage({
        directory,
        schema,
        migrations: migrationsWith(() => {
          throw new Error("Injected interruption");
        }),
      }),
      /Injected interruption/,
    );
    let calls = 0;
    storage = await openKeyValueStorage({
      directory,
      schema,
      migrations: migrationsWith((title) => {
        calls++;
        return title.length;
      }),
    });
    assert.equal(calls, 4, "one data step per branch, run once each");
    assert.deepEqual(
      (await rows(await storage.snapshot())).map((row) => row.words),
      [3, 9],
    );
    await storage.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("openStorage migrates a legacy file database into LMDB once and keeps the source", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hydb-open-legacy-"));
  try {
    const file = await openNodeStorage({ directory, schema: schemaV1 });
    await seed(file, ["alpha", "beta gamma"]);
    await file.close();
    const source = join(directory, "hydb.data");
    const digest = await sha256(source);
    const reports: FileMigrationReport[] = [];
    let storage = await openStorage({
      directory,
      schema,
      migrations: migrationsWith(),
      onLegacyMigration: (report) => reports.push(report),
    });
    assert.equal(reports.length, 1);
    assert.equal(reports[0]!.sourceSha256, digest);
    assert.equal(reports[0]!.import.branches, 2);
    for (const branch of ["main", "work"]) {
      const snapshot = await storage.snapshot({ branch });
      assert.deepEqual(
        (await rows(snapshot)).map((row) => [row.title, row.words]),
        [
          ["alpha", 1],
          ["beta gamma", 2],
        ],
      );
      await snapshot.close();
    }
    await storage.commit({
      expectedHead: await storage.head(),
      mutations: [storageMutation.insert(tags, { id: "t1", noteId: "n0" })],
    });
    await storage.close();
    assert.equal(await sha256(source), digest, "legacy source is untouched");
    assert.deepEqual((await readdir(directory)).sort(), [
      "hydb.data",
      "hydb.data.checkpoint",
      "lmdb",
    ]);

    storage = await openStorage({
      directory,
      schema,
      migrations: migrationsWith(),
      onLegacyMigration: (report) => reports.push(report),
    });
    assert.equal(reports.length, 1, "an existing LMDB database is used as-is");
    assert.equal((await rows(await storage.snapshot(), tags)).length, 1);
    await storage.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a failed legacy migration leaves no destination and can be retried", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hydb-open-retry-"));
  try {
    const file = await openNodeStorage({ directory, schema: schemaV1 });
    await seed(file, ["alpha"]);
    await file.close();
    const digest = await sha256(join(directory, "hydb.data"));
    await mkdir(join(directory, "lmdb.staging-stale"));
    await assert.rejects(
      openStorage({
        directory,
        schema,
        migrations: migrationsWith(() => {
          throw new Error("Injected conversion failure");
        }),
      }),
      /Injected conversion failure/,
    );
    assert.deepEqual((await readdir(directory)).sort(), [
      "hydb.data",
      "hydb.data.checkpoint",
    ]);
    assert.equal(await sha256(join(directory, "hydb.data")), digest);
    const storage = await openStorage({
      directory,
      schema,
      migrations: migrationsWith(),
    });
    assert.equal((await rows(await storage.snapshot())).length, 1);
    await storage.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("openStorage defaults to a 500-commit window that timed collection enforces", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hydb-open-retention-"));
  try {
    assert.deepEqual(defaultRetention, { mode: "window", keepAtLeast: 500 });
    let storage = await openStorage({ directory, schema: schemaV1 });
    for (let i = 0; i < 520; i++)
      await storage.commit({
        expectedHead: await storage.head(),
        mutations: [
          i === 0
            ? storageMutation.insert(notesV1, { id: "n", title: "0" })
            : storageMutation.update(notesV1, ["n"], { id: "n", title: `${i}` }),
        ],
      });
    await storage.close();

    const collected = new Promise<number>((resolve, reject) => {
      void openStorage({
        directory,
        schema: schemaV1,
        gcIntervalMs: 1000,
        onGarbageCollection: (result) =>
          result.error
            ? reject(result.error)
            : resolve(result.report!.commitsCollected),
      }).then((opened) => {
        storage = opened;
      }, reject);
    });
    assert.ok((await collected) >= 20);
    assert.equal(
      (await rows(await storage.snapshot(), notesV1))[0]!.title,
      "519",
    );
    await storage.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("legacy migration imports only history inside the retention window", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hydb-open-compact-"));
  try {
    const file = await openNodeStorage({ directory, schema: schemaV1 });
    for (let i = 0; i < 40; i++)
      await file.commit({
        expectedHead: await file.head(),
        mutations: [
          i === 0
            ? storageMutation.insert(notesV1, { id: "n", title: "0" })
            : storageMutation.update(notesV1, ["n"], { id: "n", title: `${i}` }),
        ],
      });
    await file.close();
    const reports: FileMigrationReport[] = [];
    const storage = await openStorage({
      directory,
      schema: schemaV1,
      retention: { mode: "window", keepAtLeast: 5 },
      onLegacyMigration: (report) => reports.push(report),
    });
    assert.ok(
      reports[0]!.import.commits <= 7,
      `imported ${reports[0]!.import.commits} commits`,
    );
    assert.equal(
      (await rows(await storage.snapshot(), notesV1))[0]!.title,
      "39",
    );
    await storage.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
