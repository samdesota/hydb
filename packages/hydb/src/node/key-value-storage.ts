import type { AnySchema } from "../schema.js";
import type { MemoryManager } from "../memory.js";
import {
  HistoryUnavailableError,
  StorageConflictError,
  type ChangeStreamOptions,
  type CommitBatch,
  type CommitRequest,
  type RetentionPolicy,
  type SnapshotSelector,
  type StorageDatabase,
  type StorageSnapshot,
} from "../storage.js";
import { ImmutableBPlusTree, type TreeRoot } from "./bplus-tree.js";
import { decodeValue, encodeValue } from "./codec.js";
import { KeyValuePages } from "./key-value-pages.js";
import {
  type KeyValueOperation,
  type KeyValueStore,
} from "./key-value-store.js";
import { openLmdbKeyValueStore } from "./lmdb-key-value-store.js";
import { buildMigrationPlan, type Migration } from "./migration.js";
import {
  applySchemaOperation,
  migrationDatabase,
  migrationFingerprints,
  pendingMigrationMutations,
  resumeMigrationStep,
  type MigrationPendingRow,
  type MigrationStepTask,
} from "./migration-runner.js";
import { NodeSnapshot } from "./tree-snapshot.js";
import {
  applyTreeMutations,
  cloneManifest,
  foreverRetention,
  newCommitId,
  sameRetention,
  schemaMetadata,
  validateRetention,
  type DatabaseManifest,
  type StoredChange,
  type StoredCommit,
  type TableMetadata,
} from "./tree-storage-model.js";

import {
  type Branch,
  type Metadata,
  type Subscriber,
  metadataKey,
  commitKey,
  branchKey,
  historyKey,
  retainKey,
  put,
} from "./key-value-layout.js";
import {
  collectKeyValueGarbage,
  type KeyValueGarbageCollectionReport,
} from "./key-value-gc.js";

export type KeyValueStorageOptions = Readonly<{
  schema: AnySchema;
  retention?: RetentionPolicy;
  cacheBytes?: number;
  maxEntries?: number;
  memory?: MemoryManager;
  /** Maximum records/pages per GC slice (default 128). */
  gcBatchSize?: number;
  /** Ordered migration list, oldest first, declared with defineMigration.
   * Opens any schema in the chain and applies only the remaining steps, one
   * commit per step and branch. Interrupted runs resume at the next step. */
  migrations?: readonly Migration[];
  /** Run `collectGarbage()` on this interval (milliseconds). The timer does
   * not keep the process alive and stops on close. Off by default. */
  gcIntervalMs?: number;
  /** Observes timed collections. Errors from timed runs are reported here and
   * otherwise ignored; the next interval retries. */
  onGarbageCollection?: (
    result:
      | Readonly<{ report: KeyValueGarbageCollectionReport; error?: never }>
      | Readonly<{ error: unknown; report?: never }>,
  ) => void;
}> &
  (
    | Readonly<{ directory: string; store?: never }>
    | Readonly<{ store: KeyValueStore; directory?: never }>
  );

/**
 * Opt-in prototype: immutable HyDB trees backed by a replaceable KV store.
 * Directory opens use LMDB. An injected store is owned and closed by this engine.
 * One active writer per database; a metadata condition rejects stale publication
 * from another instance. Schema changes use the same ordered `migrations` as
 * the file engine. File databases can be imported offline with
 * importFileStorage or migrateFileStorage. GC reader protection is local to
 * this instance.
 */
export class KeyValueStorageDatabase implements StorageDatabase {
  private readonly branches = new Map<string, Branch>();
  private readonly pins = new Map<string, number>();
  private readonly subscribers = new Set<Subscriber>();
  private readonly retains = new Map<string, string>();
  private readonly retiring = new Set<string>();
  private readonly pendingFloors = new Map<string, number>();
  private collection?: Promise<KeyValueGarbageCollectionReport>;
  private readonly gcBatchSize: number;
  private readonly pages: KeyValuePages;
  private readonly tree: ImmutableBPlusTree;
  private queue: Promise<void> = Promise.resolve();
  private closing?: Promise<void>;
  private closed = false;
  private failed = false;
  private gcTimer?: ReturnType<typeof setInterval>;
  private readonly schemaFingerprints: ReadonlySet<string>;

  private constructor(
    private readonly store: KeyValueStore,
    private metadata: Metadata,
    private metadataBytes: Uint8Array,
    private readonly tables: ReadonlyMap<string, TableMetadata>,
    options: KeyValueStorageOptions,
    fingerprint: string,
    private readonly migrationSteps: readonly MigrationStepTask[],
    private readonly migrationBase: string,
    private readonly migrationFinal: string,
  ) {
    this.schemaFingerprints = migrationFingerprints(
      migrationSteps,
      fingerprint,
      migrationBase,
      migrationFinal,
    );
    this.gcBatchSize = options.gcBatchSize ?? 128;
    this.pages = new KeyValuePages(store, metadata.nextPageId);
    this.tree = new ImmutableBPlusTree(this.pages, options);
  }

  static async open(
    options: KeyValueStorageOptions,
  ): Promise<KeyValueStorageDatabase> {
    if (
      !Number.isSafeInteger(options.gcBatchSize ?? 128) ||
      (options.gcBatchSize ?? 128) < 1 ||
      (options.gcBatchSize ?? 128) > 4096
    )
      throw new TypeError("gcBatchSize must be an integer between 1 and 4096");
    if (
      options.gcIntervalMs !== undefined &&
      (!Number.isFinite(options.gcIntervalMs) || options.gcIntervalMs < 1000)
    )
      throw new TypeError("gcIntervalMs must be at least 1000");
    const requested =
      options.retention === undefined
        ? undefined
        : validateRetention(options.retention);
    const schema = schemaMetadata(options.schema);
    const plan =
      options.migrations === undefined
        ? undefined
        : buildMigrationPlan(options.schema, options.migrations);
    const store = options.store ?? openLmdbKeyValueStore(options.directory!);
    let database: KeyValueStorageDatabase | undefined;
    try {
      let bytes = await store.get(metadataKey);
      if (bytes === undefined) {
        // Refuse to reinterpret an unrelated/nonempty store as a new database.
        for await (const _ of store.scan())
          throw new Error(
            "Cannot initialize a nonempty key-value store without HyDB metadata",
          );
        const id = newCommitId();
        const initial: StoredCommit = {
          id,
          committedAtMs: Date.now(),
          parent: null,
          branch: "main",
          sequence: 0,
          changes: [],
          manifest: {
            schema: schema.fingerprint,
            tables: Object.fromEntries(
              [...schema.tables.values()].map((table) => [
                table.name,
                {
                  primary: null,
                  indexes: Object.fromEntries(
                    table.indexes.map((index) => [index.name, null]),
                  ),
                },
              ]),
            ),
          },
        };
        const metadata: Metadata = {
          format: "hydb-kv-1",
          schema: schema.fingerprint,
          nextPageId: 1,
          revision: 0,
          retention: requested ?? foreverRetention,
        };
        bytes = encodeValue(metadata);
        await store.batch(
          [
            put(commitKey(id), initial),
            put(branchKey("main"), { head: id, base: id, sequence: 0 }),
            { type: "put", key: metadataKey, value: bytes },
          ],
          [{ key: metadataKey, expected: undefined }],
        );
      }
      const metadata = decodeValue(bytes) as Metadata;
      if (
        metadata.format !== "hydb-kv-1" ||
        !Number.isSafeInteger(metadata.nextPageId) ||
        metadata.nextPageId < 1 ||
        !Number.isSafeInteger(metadata.revision)
      ) {
        throw new Error("Invalid key-value storage metadata");
      }
      validateRetention(metadata.retention);
      database = new KeyValueStorageDatabase(
        store,
        metadata,
        bytes,
        schema.tables,
        options,
        schema.fingerprint,
        plan?.steps ?? [],
        plan?.base ?? schema.fingerprint,
        plan?.final ?? schema.fingerprint,
      );
      if (!database.schemaFingerprints.has(metadata.schema))
        throw new TypeError(
          "Storage schema does not match the supplied schema; declare the change in migrations",
        );
      for await (const entry of store.scan("branch/")) {
        const name = decodeURIComponent(entry.key.slice("branch/".length));
        const branch = decodeValue(entry.value) as Branch;
        const head = await database.readCommit(branch.head);
        if (!database.schemaFingerprints.has(head.manifest.schema))
          throw new TypeError(
            "Storage schema does not match the supplied schema; declare the change in migrations",
          );
        database.branches.set(name, branch);
      }
      for await (const entry of store.scan("retain/")) {
        database.retains.set(entry.key, decodeValue(entry.value) as string);
      }
      if (!database.branches.has("main"))
        throw new Error("Missing main branch");
      if (
        requested !== undefined &&
        !sameRetention(requested, metadata.retention)
      ) {
        await database.publish([], requested);
      }
      await database.migrate();
      if (metadata.schema !== schema.fingerprint)
        await database.publish([], undefined, schema.fingerprint);
      const main = await database.readCommit(database.branch("main").head);
      if (main.manifest.schema !== schema.fingerprint)
        throw new TypeError("Storage schema does not match the supplied schema");
      database.startGarbageCollection(options);
      return database;
    } catch (error) {
      database?.tree.dispose();
      await store.close();
      throw error;
    }
  }

  async head(branch = "main"): Promise<string> {
    this.assertOpen();
    return this.branch(branch).head;
  }

  async snapshot(selector?: SnapshotSelector): Promise<StorageSnapshot> {
    this.assertOpen();
    const name =
      selector !== undefined && "commit" in selector
        ? undefined
        : (selector?.branch ?? "main");
    const branch = name === undefined ? undefined : this.branch(name);
    const id =
      selector !== undefined && "commit" in selector
        ? selector.commit
        : branch!.head;
    if (this.retiring.has(id)) throw new HistoryUnavailableError(id);
    this.pins.set(id, (this.pins.get(id) ?? 0) + 1);
    const release = async () => {
      const count = this.pins.get(id)!;
      if (count === 1) this.pins.delete(id);
      else this.pins.set(id, count - 1);
    };
    try {
      const commit = await this.readCommit(id);
      if (!this.schemaFingerprints.has(commit.manifest.schema))
        throw new TypeError("Storage schema does not match the supplied schema");
      return new NodeSnapshot(
        id,
        branch?.sequence ?? commit.sequence,
        name,
        commit.manifest,
        this.tree,
        this.tables,
        release,
      );
    } catch (error) {
      await release();
      throw error;
    }
  }

  createBranch(request: { name: string; from: string }): Promise<void> {
    return this.enqueue(async () => {
      if (this.branches.has(request.name))
        throw new TypeError(`Branch already exists: ${request.name}`);
      await this.readCommit(request.from);
      const branch = { head: request.from, base: request.from, sequence: 0 };
      await this.publish([put(branchKey(request.name), branch)]);
      this.branches.set(request.name, branch);
    });
  }

  commit(request: CommitRequest): Promise<CommitBatch> {
    return this.enqueue(() => this.commitNow(request));
  }

  private async commitNow(
    request: CommitRequest,
    migrationStep?: number,
  ): Promise<CommitBatch> {
    const name = request.branch ?? "main";
    const current = this.branch(name);
    if (
      request.expectedHead !== undefined &&
      request.expectedHead !== current.head
    )
      throw new StorageConflictError(request.expectedHead, current.head);
    if (
      request.expectedHead === undefined &&
      request.expectedVersion !== current.sequence
    )
      throw new StorageConflictError(
        request.expectedVersion ?? -1,
        current.sequence,
      );
    const parent = await this.readCommit(current.head);
    const manifest = cloneManifest(parent.manifest);
    if (migrationStep !== undefined)
      manifest.migration = { step: migrationStep };
    try {
      const changes = await applyTreeMutations(
        this.tree,
        this.tables,
        manifest,
        request.mutations,
        () =>
          this.pages.retainRoots(
            Object.values(manifest.tables).flatMap((table) => [
              table.primary,
              ...Object.values(table.indexes),
            ]),
          ),
      );
      const stored: StoredCommit = {
        id: newCommitId(),
        committedAtMs: Date.now(),
        parent: current.head,
        branch: name,
        sequence: current.sequence + 1,
        manifest,
        changes,
      };
      const branch = {
        ...current,
        head: stored.id!,
        sequence: stored.sequence,
      };
      await this.publish([
        ...this.pages.operations(),
        put(commitKey(stored.id!), stored),
        put(historyKey(name, stored.sequence), stored.id!),
        put(branchKey(name), branch),
      ]);
      this.branches.set(name, branch);
      const batch = this.toBatch(stored);
      for (const subscriber of this.subscribers) {
        if (subscriber.branch !== name || stored.sequence <= subscriber.after)
          continue;
        subscriber.queue.push(batch);
        subscriber.after = stored.sequence;
        subscriber.wake?.();
        subscriber.wake = undefined;
      }
      return batch;
    } finally {
      this.pages.discard();
    }
  }

  /**
   * Applies every remaining migration step as its own commit per branch, before
   * the database is handed out. Each commit is published atomically with the
   * metadata, and its manifest carries a progress marker, so a crash resumes
   * at the first step that never published.
   */
  private async migrate(): Promise<void> {
    if (this.migrationSteps.length === 0) return;
    for (const name of [...this.branches.keys()]) {
      const head = await this.readCommit(this.branch(name).head);
      for (
        let index = resumeMigrationStep(
          head.manifest,
          this.migrationSteps,
          this.migrationBase,
          this.migrationFinal,
        );
        index < this.migrationSteps.length;
        index += 1
      ) {
        const step = this.migrationSteps[index]!;
        if (step.kind === "legacy")
          throw new TypeError("Legacy migration steps need the file engine");
        const state = this.branch(name);
        const parent = await this.readCommit(state.head);
        if (step.kind === "data") {
          if (parent.manifest.schema !== step.fingerprint)
            throw new TypeError(
              `Migration data step ${index + 1} expects schema ${step.fingerprint}; storage is at ${parent.manifest.schema}`,
            );
          const pending = new Map<string, MigrationPendingRow>();
          await step.run(
            migrationDatabase(this.tree, this.tables, parent.manifest, pending),
          );
          // An empty data step still commits so the progress marker advances.
          await this.commitNow(
            {
              branch: name,
              expectedHead: state.head,
              mutations: pendingMigrationMutations(this.tables, pending),
            },
            index + 1,
          );
          continue;
        }
        if (parent.manifest.schema !== step.from)
          throw new TypeError(
            `Migration step ${index + 1} expects schema ${step.from}; storage is at ${parent.manifest.schema}`,
          );
        const manifest = cloneManifest(parent.manifest);
        const changes: StoredChange[] = [];
        try {
          await applySchemaOperation(
            this.tree,
            this.tables,
            manifest,
            changes,
            step.op,
            (building) =>
              this.pages.retainRoots([...manifestRoots(manifest), building]),
          );
          manifest.schema = step.to;
          manifest.migration = { step: index + 1 };
          const stored: StoredCommit = {
            id: newCommitId(),
            committedAtMs: Date.now(),
            parent: state.head,
            branch: name,
            sequence: state.sequence + 1,
            manifest,
            changes,
          };
          const branch = {
            ...state,
            head: stored.id!,
            sequence: stored.sequence,
          };
          this.pages.retainRoots(manifestRoots(manifest));
          await this.publish(
            [
              ...this.pages.operations(),
              put(commitKey(stored.id!), stored),
              put(historyKey(name, stored.sequence), stored.id!),
              put(branchKey(name), branch),
            ],
            undefined,
            name === "main" ? step.to : undefined,
          );
          this.branches.set(name, branch);
        } finally {
          this.pages.discard();
        }
      }
    }
  }

  private startGarbageCollection(options: KeyValueStorageOptions): void {
    if (options.gcIntervalMs === undefined) return;
    this.gcTimer = setInterval(() => {
      if (this.closed || this.closing || this.failed || this.collection)
        return;
      this.collectGarbage().then(
        (report) => options.onGarbageCollection?.({ report }),
        (error) => options.onGarbageCollection?.({ error }),
      );
    }, options.gcIntervalMs);
    this.gcTimer.unref?.();
  }

  async *changes(options: ChangeStreamOptions): AsyncIterable<CommitBatch> {
    this.assertOpen();
    const branch = options.branch ?? "main";
    if (!Number.isSafeInteger(options.after) || options.after < 0)
      throw new TypeError("Change cursor must be a nonnegative integer");
    const state = this.branch(branch);
    const floor = Math.max(
      state.floor ?? 0,
      this.pendingFloors.get(branch) ?? 0,
    );
    if (options.after < floor)
      throw new HistoryUnavailableError(undefined, floor);
    const through = state.sequence;
    const subscriber: Subscriber = {
      branch,
      after: Math.max(through, options.after),
      retainAfter: options.after,
      queue: [],
    };
    const wake = () => subscriber.wake?.();
    options.signal?.addEventListener("abort", wake, { once: true });
    this.subscribers.add(subscriber);
    try {
      // Read immutable history records individually: never hold an LMDB reader
      // transaction open while a consumer pauses between yielded changes.
      for (let sequence = options.after + 1; sequence <= through; sequence++) {
        if (this.closed || options.signal?.aborted) return;
        const value = await this.store.get(historyKey(branch, sequence));
        if (value === undefined)
          throw new HistoryUnavailableError(`${branch}:${sequence}`);
        const commit = await this.readCommit(decodeValue(value) as string);
        subscriber.retainAfter = sequence;
        yield this.toBatch(commit);
      }
      while (!this.closed && !options.signal?.aborted) {
        const batch = subscriber.queue.shift();
        if (batch) {
          subscriber.retainAfter = batch.sequence;
          yield batch;
        } else
          await new Promise<void>((resolve) => {
            subscriber.wake = resolve;
          });
      }
    } finally {
      options.signal?.removeEventListener("abort", wake);
      this.subscribers.delete(subscriber);
    }
  }

  retain(request: { name: string; commit: string }): Promise<void> {
    return this.enqueue(async () => {
      if (!request.name.trim())
        throw new TypeError("Retention name cannot be empty");
      await this.readCommit(request.commit);
      const key = retainKey(request.name);
      const existing = await this.store.get(key);
      if (existing !== undefined && decodeValue(existing) !== request.commit)
        throw new TypeError(`Retention already exists: ${request.name}`);
      await this.publish([put(key, request.commit)]);
      this.retains.set(key, request.commit);
    });
  }

  releaseRetention(name: string): Promise<void> {
    return this.enqueue(async () => {
      const key = retainKey(name);
      if ((await this.store.get(key)) === undefined)
        throw new TypeError(`Unknown retention: ${name}`);
      await this.publish([{ type: "delete", key }]);
      this.retains.delete(key);
    });
  }

  collectGarbage(): Promise<KeyValueGarbageCollectionReport> {
    this.assertOpen();
    return (this.collection ??= collectKeyValueGarbage({
      store: this.store,
      tree: this.tree,
      branches: this.branches,
      pins: this.pins,
      retains: this.retains,
      subscribers: this.subscribers,
      retiring: this.retiring,
      pendingFloors: this.pendingFloors,
      batchSize: this.gcBatchSize,
      enqueue: (operation) => this.enqueue(operation),
      publish: (operations) => this.publish(operations),
      checkpoint: () => this.assertOpen(),
      capture: () => ({
        nextPageId: this.pages.nextId,
        retention: this.metadata.retention,
      }),
    }).finally(() => {
      this.collection = undefined;
    }));
  }

  close(): Promise<void> {
    return (this.closing ??= (async () => {
      clearInterval(this.gcTimer);
      await this.collection?.catch(() => undefined);
      await this.queue;
      this.closed = true;
      for (const subscriber of this.subscribers) subscriber.wake?.();
      this.tree.dispose();
      await this.store.close();
    })());
  }

  private async publish(
    operations: readonly KeyValueOperation[],
    retention = this.metadata.retention,
    schema = this.metadata.schema,
  ): Promise<void> {
    const next: Metadata = {
      ...this.metadata,
      schema,
      nextPageId: this.pages.nextId,
      revision: this.metadata.revision + 1,
      retention,
    };
    const bytes = encodeValue(next);
    try {
      await this.store.batch(
        [...operations, { type: "put", key: metadataKey, value: bytes }],
        [{ key: metadataKey, expected: this.metadataBytes }],
      );
    } catch (error) {
      // A backend error can occur after durable publication. Never continue
      // from stale in-memory roots after an ambiguous outcome or a stale writer.
      this.failed = true;
      throw error;
    }
    this.metadata = next;
    this.metadataBytes = bytes;
  }

  private async readCommit(id: string): Promise<StoredCommit> {
    const value = await this.store.get(commitKey(id));
    if (value === undefined) throw new HistoryUnavailableError(id);
    const commit = decodeValue(value) as StoredCommit;
    // History may predate migrations; snapshots and open validate schemas.
    if (commit.id !== id)
      throw new Error("Invalid commit in key-value storage");
    return commit;
  }

  private branch(name: string): Branch {
    const branch = this.branches.get(name);
    if (!branch) throw new TypeError(`Unknown branch: ${name}`);
    return branch;
  }

  private toBatch(commit: StoredCommit): CommitBatch {
    return Object.freeze({
      commit: commit.id!,
      branch: commit.branch,
      sequence: commit.sequence,
      version: commit.sequence,
      parent: commit.parent!,
      changes: Object.freeze(
        commit.changes.map((change) => {
          const table = this.tables.get(change.table)?.table;
          if (!table) throw new TypeError(`Unknown table: ${change.table}`);
          return Object.freeze({
            ...change,
            table,
            key: Object.freeze([...change.key]),
            ...(change.before === undefined
              ? {}
              : { before: Object.freeze(change.before) }),
            ...(change.after === undefined
              ? {}
              : { after: Object.freeze(change.after) }),
          });
        }),
      ),
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    this.assertOpen();
    const result = this.queue.then(() => {
      if (this.failed)
        throw new Error(
          "Key-value storage requires reopening after a publication failure",
        );
      return operation();
    });
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private assertOpen(): void {
    if (this.closed || this.closing || this.failed)
      throw new Error("Key-value storage is closed or requires reopening");
  }
}

function manifestRoots(manifest: DatabaseManifest): TreeRoot[] {
  return Object.values(manifest.tables).flatMap((table) => [
    table.primary,
    ...Object.values(table.indexes),
  ]);
}

export const openKeyValueStorage = (
  options: KeyValueStorageOptions,
): Promise<KeyValueStorageDatabase> => KeyValueStorageDatabase.open(options);
