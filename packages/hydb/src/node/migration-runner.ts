import type {
  StorageKey,
  StorageMutation,
} from "../storage.js";
import type { ImmutableBPlusTree, TreeRoot } from "./bplus-tree.js";
import { encodeOrderedKey, encodeValue, keyPrefixUpperBound } from "./codec.js";
import type {
  MigrationDatabase,
  MigrationDataStep,
  SchemaOp,
} from "./migration.js";
import {
  cloneRow,
  decodeRow,
  indexKey,
  indexPrefix,
  primaryKey,
  type DatabaseManifest,
  type StoredChange,
  type StoredRow,
  type TableMetadata,
} from "./tree-storage-model.js";

/**
 * One executable migration step, shared by the file and key-value engines.
 * `schema` steps come from the declarative migration list (one commit per
 * operation); `data` steps run a callback and flush its writes as one commit;
 * `legacy` steps are the file engine's historical inline-option groups.
 */
export type MigrationStepTask =
  | Readonly<{ kind: "schema"; op: SchemaOp; from: string; to: string }>
  | Readonly<{ kind: "data"; run: MigrationDataStep; fingerprint: string }>
  | Readonly<{
      kind: "legacy";
      from: string;
      to: string;
      columns: Readonly<Record<string, readonly string[]>>;
      tables?: readonly string[];
    }>;

/** A row write buffered by a data step, flushed as a single commit. */
export type MigrationPendingRow = {
  table: string;
  key: StorageKey;
  encodedKey: Uint8Array;
  /** The row as it exists in committed storage, when it exists there. */
  before?: StoredRow;
  /** The row after the write; undefined means delete. */
  after?: StoredRow;
};

/** Every schema fingerprint a branch head may legitimately carry. */
export function migrationFingerprints(
  steps: readonly MigrationStepTask[],
  ...known: readonly string[]
): ReadonlySet<string> {
  const fingerprints = new Set<string>(known);
  for (const step of steps) {
    if (step.kind !== "data") fingerprints.add(step.from);
    fingerprints.add(step.kind === "data" ? step.fingerprint : step.to);
  }
  return fingerprints;
}

/**
 * Determines which migration step a branch head must resume at. The progress
 * marker is only trusted when it agrees with the head schema fingerprint:
 * markers written by an earlier migration step list do not index the supplied
 * steps, so a stale index must never skip or repeat work.
 */
export function resumeMigrationStep(
  manifest: DatabaseManifest,
  steps: readonly MigrationStepTask[],
  base: string,
  final: string,
): number {
  const schema = manifest.schema;
  const marker = manifest.migration;
  if (marker !== undefined) {
    if (
      typeof marker.step !== "number" ||
      !Number.isSafeInteger(marker.step) ||
      marker.step < 0 ||
      marker.step > steps.length
    ) {
      throw new TypeError(
        "Storage migration progress marker does not match the supplied migrations",
      );
    }
    const next = steps[marker.step];
    const nextFrom =
      next === undefined
        ? final
        : next.kind === "data"
          ? next.fingerprint
          : next.from;
    if (schema === nextFrom) return marker.step;
  }
  if (schema === final) return steps.length;
  if (schema === base) return 0;
  // Commits written before per-step markers existed sit at an intermediate
  // chain fingerprint; resume after the step that produced it.
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index]!;
    const target = step.kind === "data" ? step.fingerprint : step.to;
    if (target === schema) return index + 1;
  }
  throw new TypeError("Storage schema does not match the supplied schema");
}

function assertIndexFree(
  metadata: TableMetadata,
  column: string,
  action: string,
): void {
  for (const index of metadata.indexes) {
    if (index.columns.includes(column)) {
      throw new TypeError(
        `Cannot ${action} indexed column: ${metadata.name}.${column}`,
      );
    }
  }
}

/**
 * Applies one declarative schema operation to `manifest`. The default row
 * rewrite adds new columns as null and strips dropped ones; changeColumn keeps
 * row values (conversions belong in interleaved data steps), and added tables
 * only seed their manifest entry. `afterMutation` runs after every tree write
 * with any root that is under construction and not yet in the manifest, so a
 * buffering page store can discard unreachable intermediate pages.
 */
export async function applySchemaOperation(
  tree: ImmutableBPlusTree,
  tables: ReadonlyMap<string, TableMetadata>,
  manifest: DatabaseManifest,
  changes: StoredChange[],
  op: SchemaOp,
  afterMutation?: (building: TreeRoot) => void,
): Promise<void> {
  if (op.type === "addTable") {
    const metadata = tables.get(op.description.name);
    if (metadata === undefined) {
      throw new TypeError(`Unknown migration table: ${op.description.name}`);
    }
    manifest.tables[op.description.name] = {
      primary: null,
      indexes: Object.fromEntries(
        metadata.indexes.map((index) => [index.name, null]),
      ),
    };
    return;
  }
  if (op.type === "dropTable") {
    if (manifest.tables[op.description.name] === undefined) {
      throw new TypeError(`Unknown migration table: ${op.description.name}`);
    }
    delete manifest.tables[op.description.name];
    return;
  }
  const table = manifest.tables[op.table];
  const metadata = tables.get(op.table);
  if (table === undefined || metadata === undefined) {
    throw new TypeError(`Unknown migration table: ${op.table}`);
  }
  if (op.type === "addIndex") {
    if (table.indexes[op.index.name] !== undefined) {
      throw new TypeError(`Index already exists: ${op.table}.${op.index.name}`);
    }
    // Rows are unchanged, so no change records; only the new tree is written.
    let root: TreeRoot = null;
    for await (const entry of tree.scan(table.primary)) {
      const row = decodeRow(entry.value);
      const key = primaryKey(metadata, row);
      if (op.index.unique) {
        const prefix = encodeOrderedKey(indexPrefix(op.index, row));
        for await (const _ of tree.scan(root, {
          gte: prefix,
          lt: keyPrefixUpperBound(prefix),
          limit: 1,
        })) {
          throw new TypeError(
            `Unique index ${op.index.name} rejected a duplicate key`,
          );
        }
      }
      root = await tree.mutate(root, [
        {
          type: "put",
          key: indexKey(op.index, row, key),
          value: encodeValue(key),
        },
      ]);
      afterMutation?.(root);
    }
    table.indexes[op.index.name] = root;
    return;
  }
  if (op.type === "dropIndex") {
    if (!(op.index.name in table.indexes)) {
      throw new TypeError(`Unknown index: ${op.table}.${op.index.name}`);
    }
    delete table.indexes[op.index.name];
    return;
  }
  if (op.type === "changeColumn") {
    assertIndexFree(metadata, op.column.name, "change");
    return;
  }
  assertIndexFree(
    metadata,
    op.column.name,
    op.type === "addColumn" ? "add" : "drop",
  );
  const original = table.primary;
  for await (const entry of tree.scan(original)) {
    const before = decodeRow(entry.value);
    let after: StoredRow;
    if (op.type === "addColumn") {
      after = { ...before, [op.column.name]: null };
    } else {
      const { [op.column.name]: _removed, ...rest } = before;
      if (Object.keys(rest).length === Object.keys(before).length) continue;
      after = rest;
    }
    table.primary = await tree.mutate(table.primary, [
      { type: "put", key: entry.key, value: encodeValue(after) },
    ]);
    afterMutation?.(null);
    changes.push({
      table: op.table,
      key: primaryKey(metadata, before),
      before,
      after,
    });
  }
}

/**
 * The database surface handed to a data step. Reads see committed rows with
 * the step's buffered writes overlaid; writes are buffered and flushed as one
 * commit when the step finishes (see `pendingMigrationMutations`).
 */
export function migrationDatabase(
  tree: ImmutableBPlusTree,
  tables: ReadonlyMap<string, TableMetadata>,
  manifest: DatabaseManifest,
  pending: Map<string, MigrationPendingRow>,
): MigrationDatabase {
  const resolve = (table: string) => {
    const entry = manifest.tables[table];
    const metadata = tables.get(table);
    if (entry === undefined || metadata === undefined) {
      throw new TypeError(`Unknown table: ${table}`);
    }
    return entry;
  };
  const pendingKey = (table: string, encoded: Uint8Array): string =>
    `${table}:${Buffer.from(encoded).toString("hex")}`;
  const treeRow = async (
    table: string,
    encoded: Uint8Array,
  ): Promise<StoredRow | undefined> => {
    const bytes = await tree.get(resolve(table).primary, encoded);
    return bytes === undefined ? undefined : decodeRow(bytes);
  };
  const currentRow = async (
    table: string,
    encoded: Uint8Array,
  ): Promise<StoredRow | undefined> => {
    const op = pending.get(pendingKey(table, encoded));
    if (op !== undefined) return op.after ?? undefined;
    return await treeRow(table, encoded);
  };
  const buffer = (
    table: string,
    key: StorageKey,
    encoded: Uint8Array,
    after: StoredRow | undefined,
    before: StoredRow | undefined,
  ): void => {
    const previous = pending.get(pendingKey(table, encoded));
    pending.set(pendingKey(table, encoded), {
      table,
      key: [...key],
      encodedKey: encoded,
      after,
      ...(previous?.before !== undefined
        ? { before: previous.before }
        : before !== undefined
          ? { before }
          : {}),
    });
  };
  const scanRows = async function* (table: string): AsyncGenerator<StoredRow> {
    const root = resolve(table).primary;
    const ops = [...pending.values()]
      .filter((op) => op.table === table)
      .sort((left, right) => Buffer.compare(left.encodedKey, right.encodedKey));
    let opIndex = 0;
    for await (const entry of tree.scan(root)) {
      const encoded = entry.key;
      while (
        opIndex < ops.length &&
        Buffer.compare(ops[opIndex]!.encodedKey, encoded) < 0
      ) {
        const op = ops[opIndex++]!;
        if (op.after !== undefined) yield op.after;
      }
      if (
        opIndex < ops.length &&
        Buffer.compare(ops[opIndex]!.encodedKey, encoded) === 0
      ) {
        const op = ops[opIndex++]!;
        if (op.after !== undefined) yield op.after;
        continue;
      }
      yield decodeRow(entry.value);
    }
    while (opIndex < ops.length) {
      const op = ops[opIndex++]!;
      if (op.after !== undefined) yield op.after;
    }
  };
  const priorBefore = async (table: string, encoded: Uint8Array) => {
    const previous = pending.get(pendingKey(table, encoded));
    return (
      previous?.before ??
      (previous === undefined ? await treeRow(table, encoded) : undefined)
    );
  };
  return {
    scan: (table) => scanRows(table),
    insert: async (table, row) => {
      resolve(table);
      const metadata = tables.get(table)!;
      const key = primaryKey(metadata, row as StoredRow);
      const encoded = encodeOrderedKey(key);
      if ((await currentRow(table, encoded)) !== undefined) {
        throw new TypeError(`Duplicate primary key for table ${table}`);
      }
      buffer(table, key, encoded, cloneRow(row), undefined);
    },
    update: async (table, key, patch) => {
      resolve(table);
      const metadata = tables.get(table)!;
      const encoded = encodeOrderedKey(key);
      const current = await currentRow(table, encoded);
      if (current === undefined) {
        throw new TypeError(`Missing row for table ${table}`);
      }
      const after = { ...current, ...patch };
      if (
        Buffer.compare(encodeOrderedKey(primaryKey(metadata, after)), encoded) !==
        0
      ) {
        throw new TypeError(`Primary keys cannot be updated for table ${table}`);
      }
      buffer(table, key, encoded, after, await priorBefore(table, encoded));
    },
    delete: async (table, key) => {
      resolve(table);
      const encoded = encodeOrderedKey(key);
      const current = await currentRow(table, encoded);
      if (current === undefined) {
        throw new TypeError(`Missing row for table ${table}`);
      }
      buffer(table, key, encoded, undefined, await priorBefore(table, encoded));
    },
  };
}

/** Converts a data step's buffered writes into ordinary storage mutations. */
export function pendingMigrationMutations(
  tables: ReadonlyMap<string, TableMetadata>,
  pending: ReadonlyMap<string, MigrationPendingRow>,
): StorageMutation[] {
  const mutations: StorageMutation[] = [];
  for (const op of pending.values()) {
    const table = tables.get(op.table)?.table;
    if (table === undefined) {
      throw new TypeError(`Unknown migration table: ${op.table}`);
    }
    if (op.after === undefined) {
      mutations.push({ type: "delete", table, key: op.key });
    } else if (op.before === undefined) {
      mutations.push({ type: "insert", table, row: op.after });
    } else {
      mutations.push({ type: "update", table, key: op.key, row: op.after });
    }
  }
  return mutations;
}
