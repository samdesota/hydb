import { createHash, randomUUID } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import {
  copyFile,
  mkdir,
  open,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import type { AnySchema } from "../schema.js";
import type { RetentionPolicy } from "../storage.js";
import { importFileStorage, type FileImportReport } from "./file-import.js";
import {
  openKeyValueStorage,
  type KeyValueStorageDatabase,
  type KeyValueStorageOptions,
} from "./key-value-storage.js";
import type { Migration } from "./migration.js";
import { openNodeStorage } from "./node-storage.js";

/** The retention `openStorage` applies when none is given. */
export const defaultRetention: RetentionPolicy = Object.freeze({
  mode: "window",
  keepAtLeast: 500,
});

/** Name of the LMDB directory `openStorage` keeps inside its directory. */
export const storageDirectoryName = "lmdb";
/** The legacy file engine's data file, left in place after migration. */
export const legacyDataFileName = "hydb.data";

export type FileMigrationReport = Readonly<{
  sourceFile: string;
  destinationDirectory: string;
  sourceSha256: string;
  import: FileImportReport;
}>;

export type MigrateFileStorageOptions = Readonly<{
  /** Directory holding the file engine's `hydb.data`. Never modified. */
  sourceDirectory: string;
  /** New LMDB directory. Must not exist; it appears only when complete. */
  destinationDirectory: string;
  schema: AnySchema;
  migrations?: readonly Migration[];
  retention?: RetentionPolicy;
  onProgress?: (phase: string, count: number) => void;
}>;

const exists = (path: string) =>
  stat(path).then(
    () => true,
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return false;
      throw error;
    },
  );

async function fileIdentity(path: string) {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  const info = await stat(path, { bigint: true });
  return {
    sha256: hash.digest("hex"),
    key: [info.dev, info.ino, info.size, info.mtimeNs].map(String).join(":"),
  };
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/**
 * Offline, verified move of a file-engine database into a new LMDB database.
 * Stop every writer of the source first. The source is never opened writable:
 * a copy is migrated to the current schema with the file engine's migrations,
 * compacted to a window `retention` (history outside it is not imported),
 * imported with full verification, reopened with `migrations` and `retention`,
 * and only then renamed into `destinationDirectory`. Any failure removes the
 * staging directory and leaves no destination, so rerunning starts over. The
 * source must be byte-identical at the end, or the migration fails.
 */
export async function migrateFileStorage(
  options: MigrateFileStorageOptions,
): Promise<FileMigrationReport> {
  const sourceFile = resolve(options.sourceDirectory, legacyDataFileName);
  const destination = resolve(options.destinationDirectory);
  if (await exists(destination))
    throw new Error(`Migration destination already exists: ${destination}`);
  const before = await fileIdentity(sourceFile);
  await mkdir(dirname(destination), { recursive: true });
  // A sibling keeps the final rename on one filesystem.
  const staging = `${destination}.staging-${randomUUID()}`;
  await mkdir(staging, { mode: 0o700 });
  try {
    const copy = join(staging, "file");
    await mkdir(copy);
    // Clone where the filesystem supports it (APFS, btrfs); copy otherwise.
    await copyFile(
      sourceFile,
      join(copy, legacyDataFileName),
      constants.COPYFILE_FICLONE,
    );
    options.onProgress?.("migrate-file", 0);
    const file = await openNodeStorage({
      directory: copy,
      schema: options.schema,
      ...(options.migrations ? { migrations: options.migrations } : {}),
      ...(options.retention ? { retention: options.retention } : {}),
    });
    try {
      // Compact the disposable clone to the retention window first, so only
      // retained history is imported and the LMDB file starts small.
      if (options.retention?.mode === "window") {
        options.onProgress?.("compact-file", 0);
        await file.collectGarbage();
      }
    } finally {
      await file.close();
    }
    const imported = join(staging, storageDirectoryName);
    const report = await importFileStorage({
      sourceFile: join(copy, legacyDataFileName),
      destinationDirectory: imported,
      schema: options.schema,
      ...(options.onProgress ? { onProgress: options.onProgress } : {}),
    });
    const storage = await openKeyValueStorage({
      directory: imported,
      schema: options.schema,
      ...(options.migrations ? { migrations: options.migrations } : {}),
      ...(options.retention ? { retention: options.retention } : {}),
    });
    await storage.close();
    const after = await fileIdentity(sourceFile);
    if (after.key !== before.key || after.sha256 !== before.sha256)
      throw new Error(
        "Source changed during migration; stop its writer and retry",
      );
    await rename(imported, destination);
    await syncDirectory(dirname(destination));
    return {
      sourceFile,
      destinationDirectory: destination,
      sourceSha256: before.sha256,
      import: report,
    };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export type OpenStorageOptions = Omit<
  KeyValueStorageOptions,
  "directory" | "store"
> &
  Readonly<{
    /** Owns `lmdb/`. A legacy `hydb.data` here is migrated on first open. */
    directory: string;
    /** Called after a legacy file database was migrated into LMDB. */
    onLegacyMigration?: (report: FileMigrationReport) => void;
  }>;

/**
 * Recommended persistent storage: LMDB with a bounded history window
 * (`defaultRetention`, 500 commits per branch) and ordered `migrations`.
 * Pass `gcIntervalMs` to reclaim history outside the window automatically.
 *
 * The database lives in `<directory>/lmdb`. When that does not exist but a
 * file-engine `<directory>/hydb.data` does, it is migrated first with
 * `migrateFileStorage`; the file is kept for rollback. One process may open a
 * directory at a time, and it must not also be opened by the file engine.
 */
export async function openStorage(
  options: OpenStorageOptions,
): Promise<KeyValueStorageDatabase> {
  const directory = resolve(options.directory);
  const destination = join(directory, storageDirectoryName);
  await mkdir(directory, { recursive: true });
  // Staging directories exist only during migration; any left belong to an
  // interrupted run and are never valid databases.
  const prefix = `${basename(destination)}.staging-`;
  for (const entry of await readdir(directory))
    if (entry.startsWith(prefix))
      await rm(join(directory, entry), { recursive: true, force: true });
  const retention = options.retention ?? defaultRetention;
  if (
    !(await exists(destination)) &&
    (await exists(join(directory, legacyDataFileName)))
  ) {
    const report = await migrateFileStorage({
      sourceDirectory: directory,
      destinationDirectory: destination,
      schema: options.schema,
      retention,
      ...(options.migrations ? { migrations: options.migrations } : {}),
    });
    options.onLegacyMigration?.(report);
  }
  const { onLegacyMigration: _, directory: __, ...rest } = options;
  return openKeyValueStorage({ ...rest, retention, directory: destination });
}
