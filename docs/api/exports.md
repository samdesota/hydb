# Complete export index

[Usage reference](../../usage.md)

This index covers all 192 named exports across the nine public package entry
points. `value` means a runtime export; `type` requires a type-only import when
using TypeScript verbatim module syntax. Follow the usage link for behavior and
the source link for exact generic signatures. Builder methods are documented in
the relevant reference, not repeated as standalone exports.

## `@hyos/hydb`

| Export | Kind | Usage | Source |
| --- | --- | --- | --- |
| `MemoryLimitExceededError` | value | [Reference](runtime.md#memory-accounting) | [Definition](../../packages/hydb/src/memory.ts) |
| `MemoryManager` | value | [Reference](runtime.md#memory-accounting) | [Definition](../../packages/hydb/src/memory.ts) |
| `estimateMemoryBytes` | value | [Reference](runtime.md#memory-accounting) | [Definition](../../packages/hydb/src/memory.ts) |
| `MemoryAllocation` | type | [Reference](runtime.md#memory-accounting) | [Definition](../../packages/hydb/src/memory.ts) |
| `MemoryHandle` | type | [Reference](runtime.md#memory-accounting) | [Definition](../../packages/hydb/src/memory.ts) |
| `MemoryStats` | type | [Reference](runtime.md#memory-accounting) | [Definition](../../packages/hydb/src/memory.ts) |
| `SpillCorruptionError` | value | [Reference](runtime.md#spill-stores) | [Definition](../../packages/hydb/src/spill.ts) |
| `SpillLimitExceededError` | value | [Reference](runtime.md#spill-stores) | [Definition](../../packages/hydb/src/spill.ts) |
| `memorySpillStore` | value | [Reference](runtime.md#spill-stores) | [Definition](../../packages/hydb/src/spill.ts) |
| `SpillRun` | type | [Reference](runtime.md#spill-stores) | [Definition](../../packages/hydb/src/spill.ts) |
| `SpillRunKind` | type | [Reference](runtime.md#spill-stores) | [Definition](../../packages/hydb/src/spill.ts) |
| `SpillSession` | type | [Reference](runtime.md#spill-stores) | [Definition](../../packages/hydb/src/spill.ts) |
| `SpillStats` | type | [Reference](runtime.md#spill-stores) | [Definition](../../packages/hydb/src/spill.ts) |
| `SpillStore` | type | [Reference](runtime.md#spill-stores) | [Definition](../../packages/hydb/src/spill.ts) |
| `SpillOptions` | type | [Reference](runtime.md#spill-stores) | [Definition](../../packages/hydb/src/spill.ts) |
| `boolean` | value | [Reference](database.md#schema-builders) | [Definition](../../packages/hydb/src/schema.ts) |
| `id` | value | [Reference](database.md#schema-builders) | [Definition](../../packages/hydb/src/schema.ts) |
| `index` | value | [Reference](database.md#schema-builders) | [Definition](../../packages/hydb/src/schema.ts) |
| `integer` | value | [Reference](database.md#schema-builders) | [Definition](../../packages/hydb/src/schema.ts) |
| `json` | value | [Reference](database.md#schema-builders) | [Definition](../../packages/hydb/src/schema.ts) |
| `number` | value | [Reference](database.md#schema-builders) | [Definition](../../packages/hydb/src/schema.ts) |
| `text` | value | [Reference](database.md#schema-builders) | [Definition](../../packages/hydb/src/schema.ts) |
| `timestamp` | value | [Reference](database.md#schema-builders) | [Definition](../../packages/hydb/src/schema.ts) |
| `uniqueIndex` | value | [Reference](database.md#schema-builders) | [Definition](../../packages/hydb/src/schema.ts) |
| `InferInsert` | type | [Reference](database.md#schema-builders) | [Definition](../../packages/hydb/src/schema.ts) |
| `InferRow` | type | [Reference](database.md#schema-builders) | [Definition](../../packages/hydb/src/schema.ts) |
| `InferUpdate` | type | [Reference](database.md#schema-builders) | [Definition](../../packages/hydb/src/schema.ts) |
| `InferQueryResult` | type | [Reference](database.md#query-builder) | [Definition](../../packages/hydb/src/query.ts) |
| `Query` | type | [Reference](database.md#query-builder) | [Definition](../../packages/hydb/src/query.ts) |
| `planQuery` | value | [Reference](database.md#inspecting-plans) | [Definition](../../packages/hydb/src/planner.ts) |
| `PhysicalAccess` | type | [Reference](database.md#inspecting-plans) | [Definition](../../packages/hydb/src/planner.ts) |
| `PhysicalAuthorization` | type | [Reference](database.md#inspecting-plans) | [Definition](../../packages/hydb/src/planner.ts) |
| `PhysicalJoin` | type | [Reference](database.md#inspecting-plans) | [Definition](../../packages/hydb/src/planner.ts) |
| `PhysicalQueryPlan` | type | [Reference](database.md#inspecting-plans) | [Definition](../../packages/hydb/src/planner.ts) |
| `PlannedSelection` | type | [Reference](database.md#inspecting-plans) | [Definition](../../packages/hydb/src/planner.ts) |
| `PlannedSelectionValue` | type | [Reference](database.md#inspecting-plans) | [Definition](../../packages/hydb/src/planner.ts) |
| `PlannedValue` | type | [Reference](database.md#inspecting-plans) | [Definition](../../packages/hydb/src/planner.ts) |
| `getDatabaseSchema` | value | [Reference](database.md#database-lifecycle-and-operations) | [Definition](../../packages/hydb/src/database.ts) |
| `Database` | type | [Reference](database.md#database-lifecycle-and-operations) | [Definition](../../packages/hydb/src/database.ts) |
| `Command` | type | [Reference](database.md#legacy-hydb-command-and-gateway-apis) | [Definition](../../packages/hydb/src/command.ts) |
| `InferCommandInput` | type | [Reference](database.md#legacy-hydb-command-and-gateway-apis) | [Definition](../../packages/hydb/src/command.ts) |
| `InferCommandResult` | type | [Reference](database.md#legacy-hydb-command-and-gateway-apis) | [Definition](../../packages/hydb/src/command.ts) |
| `Transaction` | type | [Reference](database.md#transactions) | [Definition](../../packages/hydb/src/command.ts) |
| `Gateway` | type | [Reference](database.md#legacy-hydb-command-and-gateway-apis) | [Definition](../../packages/hydb/src/gateway.ts) |
| `GatewayCommands` | type | [Reference](database.md#legacy-hydb-command-and-gateway-apis) | [Definition](../../packages/hydb/src/gateway.ts) |
| `GatewaySession` | type | [Reference](database.md#legacy-hydb-command-and-gateway-apis) | [Definition](../../packages/hydb/src/gateway.ts) |
| `InferGatewayCommands` | type | [Reference](database.md#legacy-hydb-command-and-gateway-apis) | [Definition](../../packages/hydb/src/gateway.ts) |
| `createReadPolicyEnforcer` | value | [Reference](application.md#authorization) | [Definition](../../packages/hydb/src/read-policy.ts) |
| `ReadPolicy` | type | [Reference](application.md#authorization) | [Definition](../../packages/hydb/src/read-policy.ts) |
| `ReadPolicyBuilder` | type | [Reference](application.md#authorization) | [Definition](../../packages/hydb/src/read-policy.ts) |
| `AuthorizationError` | value | [Reference](application.md#authorization) | [Definition](../../packages/hydb/src/write-policy.ts) |
| `createWritePolicyEnforcer` | value | [Reference](application.md#authorization) | [Definition](../../packages/hydb/src/write-policy.ts) |
| `getWritePolicyPrincipalSchema` | value | [Reference](application.md#authorization) | [Definition](../../packages/hydb/src/write-policy.ts) |
| `writePolicy` | value | [Reference](application.md#authorization) | [Definition](../../packages/hydb/src/write-policy.ts) |
| `TransactionReader` | type | [Reference](application.md#authorization) | [Definition](../../packages/hydb/src/write-policy.ts) |
| `WriteChange` | type | [Reference](application.md#authorization) | [Definition](../../packages/hydb/src/write-policy.ts) |
| `WritePolicy` | type | [Reference](application.md#authorization) | [Definition](../../packages/hydb/src/write-policy.ts) |
| `WritePolicyBuilder` | type | [Reference](application.md#authorization) | [Definition](../../packages/hydb/src/write-policy.ts) |
| `WritePolicyEnforcer` | type | [Reference](application.md#authorization) | [Definition](../../packages/hydb/src/write-policy.ts) |
| `memoryStorage` | value | [Reference](storage.md#storagedatabase-and-snapshots) | [Definition](../../packages/hydb/src/storage.ts) |
| `storageMutation` | value | [Reference](storage.md#storagedatabase-and-snapshots) | [Definition](../../packages/hydb/src/storage.ts) |
| `HistoryUnavailableError` | value | [Reference](storage.md#storagedatabase-and-snapshots) | [Definition](../../packages/hydb/src/storage.ts) |
| `StorageConflictError` | value | [Reference](storage.md#storagedatabase-and-snapshots) | [Definition](../../packages/hydb/src/storage.ts) |
| `BranchName` | type | [Reference](storage.md#storagedatabase-and-snapshots) | [Definition](../../packages/hydb/src/storage.ts) |
| `BranchSequence` | type | [Reference](storage.md#storagedatabase-and-snapshots) | [Definition](../../packages/hydb/src/storage.ts) |
| `CommitBatch` | type | [Reference](storage.md#storagedatabase-and-snapshots) | [Definition](../../packages/hydb/src/storage.ts) |
| `CommitId` | type | [Reference](storage.md#storagedatabase-and-snapshots) | [Definition](../../packages/hydb/src/storage.ts) |
| `CommitRequest` | type | [Reference](storage.md#storagedatabase-and-snapshots) | [Definition](../../packages/hydb/src/storage.ts) |
| `GarbageCollectionReport` | type | [Reference](storage.md#storagedatabase-and-snapshots) | [Definition](../../packages/hydb/src/storage.ts) |
| `RetentionPolicy` | type | [Reference](storage.md#storagedatabase-and-snapshots) | [Definition](../../packages/hydb/src/storage.ts) |
| `StorageDatabase` | type | [Reference](storage.md#storagedatabase-and-snapshots) | [Definition](../../packages/hydb/src/storage.ts) |
| `StorageKey` | type | [Reference](storage.md#storagedatabase-and-snapshots) | [Definition](../../packages/hydb/src/storage.ts) |
| `StorageMutation` | type | [Reference](storage.md#storagedatabase-and-snapshots) | [Definition](../../packages/hydb/src/storage.ts) |
| `StorageRange` | type | [Reference](storage.md#storagedatabase-and-snapshots) | [Definition](../../packages/hydb/src/storage.ts) |
| `StorageScan` | type | [Reference](storage.md#storagedatabase-and-snapshots) | [Definition](../../packages/hydb/src/storage.ts) |
| `StorageSnapshot` | type | [Reference](storage.md#storagedatabase-and-snapshots) | [Definition](../../packages/hydb/src/storage.ts) |
| `SnapshotSelector` | type | [Reference](storage.md#storagedatabase-and-snapshots) | [Definition](../../packages/hydb/src/storage.ts) |
| `hydb` | value | [Reference](database.md#schema-builders) | [Definition](../../packages/hydb/src/index.ts) |

## `@hyos/hydb/node`

| Export | Kind | Usage | Source |
| --- | --- | --- | --- |
| `ImmutableBPlusTree` | value | [Reference](runtime.md#immutable-trees-and-page-stores) | [Definition](../../packages/hydb/src/node/bplus-tree.ts) |
| `PageId` | type | [Reference](runtime.md#immutable-trees-and-page-stores) | [Definition](../../packages/hydb/src/node/tree-page-store.ts) |
| `TreePageStore` | type | [Reference](runtime.md#immutable-trees-and-page-stores) | [Definition](../../packages/hydb/src/node/tree-page-store.ts) |
| `TreeEntry` | type | [Reference](runtime.md#immutable-trees-and-page-stores) | [Definition](../../packages/hydb/src/node/bplus-tree.ts) |
| `TreeMutation` | type | [Reference](runtime.md#immutable-trees-and-page-stores) | [Definition](../../packages/hydb/src/node/bplus-tree.ts) |
| `TreeRange` | type | [Reference](runtime.md#immutable-trees-and-page-stores) | [Definition](../../packages/hydb/src/node/bplus-tree.ts) |
| `TreeRoot` | type | [Reference](runtime.md#immutable-trees-and-page-stores) | [Definition](../../packages/hydb/src/node/bplus-tree.ts) |
| `ByteLruCache` | value | [Reference](runtime.md#byte-cache-and-key-encoding) | [Definition](../../packages/hydb/src/node/page-cache.ts) |
| `PageCacheStats` | type | [Reference](runtime.md#byte-cache-and-key-encoding) | [Definition](../../packages/hydb/src/node/page-cache.ts) |
| `encodeOrderedKey` | value | [Reference](runtime.md#byte-cache-and-key-encoding) | [Definition](../../packages/hydb/src/node/codec.ts) |
| `keyPrefixUpperBound` | value | [Reference](runtime.md#byte-cache-and-key-encoding) | [Definition](../../packages/hydb/src/node/codec.ts) |
| `NodeStorageDatabase` | value | [Reference](storage.md#choose-and-open-a-backend) | [Definition](../../packages/hydb/src/node/node-storage.ts) |
| `openNodeStorage` | value | [Reference](storage.md#choose-and-open-a-backend) | [Definition](../../packages/hydb/src/node/node-storage.ts) |
| `NodeStorageOptions` | type | [Reference](storage.md#choose-and-open-a-backend) | [Definition](../../packages/hydb/src/node/node-storage.ts) |
| `addColumn` | value | [Reference](storage.md#file-engine-migrations) | [Definition](../../packages/hydb/src/node/migration.ts) |
| `addTable` | value | [Reference](storage.md#file-engine-migrations) | [Definition](../../packages/hydb/src/node/migration.ts) |
| `changeColumn` | value | [Reference](storage.md#file-engine-migrations) | [Definition](../../packages/hydb/src/node/migration.ts) |
| `checkMigrationChain` | value | [Reference](storage.md#file-engine-migrations) | [Definition](../../packages/hydb/src/node/migration.ts) |
| `data` | value | [Reference](storage.md#file-engine-migrations) | [Definition](../../packages/hydb/src/node/migration.ts) |
| `ddl` | value | [Reference](storage.md#file-engine-migrations) | [Definition](../../packages/hydb/src/node/migration.ts) |
| `defineMigration` | value | [Reference](storage.md#file-engine-migrations) | [Definition](../../packages/hydb/src/node/migration.ts) |
| `describeSchema` | value | [Reference](storage.md#file-engine-migrations) | [Definition](../../packages/hydb/src/node/migration.ts) |
| `diffSchemaDescriptions` | value | [Reference](storage.md#file-engine-migrations) | [Definition](../../packages/hydb/src/node/migration.ts) |
| `dropColumn` | value | [Reference](storage.md#file-engine-migrations) | [Definition](../../packages/hydb/src/node/migration.ts) |
| `dropTable` | value | [Reference](storage.md#file-engine-migrations) | [Definition](../../packages/hydb/src/node/migration.ts) |
| `formatMigrationSource` | value | [Reference](storage.md#file-engine-migrations) | [Definition](../../packages/hydb/src/node/migration.ts) |
| `applySchemaChanges` | value | [Reference](storage.md#file-engine-migrations) | [Definition](../../packages/hydb/src/node/migration.ts) |
| `reverseSchemaChanges` | value | [Reference](storage.md#file-engine-migrations) | [Definition](../../packages/hydb/src/node/migration.ts) |
| `deriveMigrationFingerprints` | value | [Reference](storage.md#file-engine-migrations) | [Definition](../../packages/hydb/src/node/migration.ts) |
| `schemaFingerprint` | value | [Reference](storage.md#file-engine-migrations) | [Definition](../../packages/hydb/src/node/migration.ts) |
| `ColumnDescription` | type | [Reference](storage.md#file-engine-migrations) | [Definition](../../packages/hydb/src/node/migration.ts) |
| `ColumnSpec` | type | [Reference](storage.md#file-engine-migrations) | [Definition](../../packages/hydb/src/node/migration.ts) |
| `IndexDescription` | type | [Reference](storage.md#file-engine-migrations) | [Definition](../../packages/hydb/src/node/migration.ts) |
| `Migration` | type | [Reference](storage.md#file-engine-migrations) | [Definition](../../packages/hydb/src/node/migration.ts) |
| `MigrationDataStep` | type | [Reference](storage.md#file-engine-migrations) | [Definition](../../packages/hydb/src/node/migration.ts) |
| `MigrationDatabase` | type | [Reference](storage.md#file-engine-migrations) | [Definition](../../packages/hydb/src/node/migration.ts) |
| `MigrationFingerprint` | type | [Reference](storage.md#file-engine-migrations) | [Definition](../../packages/hydb/src/node/migration.ts) |
| `MigrationStep` | type | [Reference](storage.md#file-engine-migrations) | [Definition](../../packages/hydb/src/node/migration.ts) |
| `SchemaDescription` | type | [Reference](storage.md#file-engine-migrations) | [Definition](../../packages/hydb/src/node/migration.ts) |
| `SchemaOp` | type | [Reference](storage.md#file-engine-migrations) | [Definition](../../packages/hydb/src/node/migration.ts) |
| `TableDescription` | type | [Reference](storage.md#file-engine-migrations) | [Definition](../../packages/hydb/src/node/migration.ts) |
| `nodeSpillStore` | value | [Reference](runtime.md#spill-stores) | [Definition](../../packages/hydb/src/node/spill-store.ts) |
| `KeyValueConflictError` | value | [Reference](storage.md#keyvaluestore-adapters) | [Definition](../../packages/hydb/src/node/key-value-store.ts) |
| `KeyValueStore` | type | [Reference](storage.md#keyvaluestore-adapters) | [Definition](../../packages/hydb/src/node/key-value-store.ts) |
| `KeyValueOperation` | type | [Reference](storage.md#keyvaluestore-adapters) | [Definition](../../packages/hydb/src/node/key-value-store.ts) |
| `KeyValueCondition` | type | [Reference](storage.md#keyvaluestore-adapters) | [Definition](../../packages/hydb/src/node/key-value-store.ts) |
| `memoryKeyValueStore` | value | [Reference](storage.md#keyvaluestore-adapters) | [Definition](../../packages/hydb/src/node/memory-key-value-store.ts) |
| `openLmdbKeyValueStore` | value | [Reference](storage.md#keyvaluestore-adapters) | [Definition](../../packages/hydb/src/node/lmdb-key-value-store.ts) |
| `KeyValueStorageDatabase` | value | [Reference](storage.md#choose-and-open-a-backend) | [Definition](../../packages/hydb/src/node/key-value-storage.ts) |
| `openKeyValueStorage` | value | [Reference](storage.md#choose-and-open-a-backend) | [Definition](../../packages/hydb/src/node/key-value-storage.ts) |
| `KeyValueStorageOptions` | type | [Reference](storage.md#choose-and-open-a-backend) | [Definition](../../packages/hydb/src/node/key-value-storage.ts) |
| `KeyValueGarbageCollectionReport` | type | [Reference](storage.md#retention-and-garbage-collection) | [Definition](../../packages/hydb/src/node/key-value-gc.ts) |
| `importFileStorage` | value | [Reference](storage.md#import-file-storage-into-kv-storage) | [Definition](../../packages/hydb/src/node/file-import.ts) |
| `FileImportReport` | type | [Reference](storage.md#import-file-storage-into-kv-storage) | [Definition](../../packages/hydb/src/node/file-import.ts) |

## `@hyos/hyapp`

| Export | Kind | Usage | Source |
| --- | --- | --- | --- |
| `commandFactory` | value | [Reference](application.md#commands-and-contracts) | [Definition](../../packages/hyapp/src/command.ts) |
| `createClientCommandFactory` | value | [Reference](application.md#commands-and-contracts) | [Definition](../../packages/hyapp/src/command.ts) |
| `createCommandContract` | value | [Reference](application.md#commands-and-contracts) | [Definition](../../packages/hyapp/src/command.ts) |
| `createServerCommandFactory` | value | [Reference](application.md#commands-and-contracts) | [Definition](../../packages/hyapp/src/command.ts) |
| `executeOptimisticCommand` | value | [Reference](application.md#commands-and-contracts) | [Definition](../../packages/hyapp/src/command.ts) |
| `executeServerCommand` | value | [Reference](application.md#commands-and-contracts) | [Definition](../../packages/hyapp/src/command.ts) |
| `parseCommandInput` | value | [Reference](application.md#commands-and-contracts) | [Definition](../../packages/hyapp/src/command.ts) |
| `parseCommandResult` | value | [Reference](application.md#commands-and-contracts) | [Definition](../../packages/hyapp/src/command.ts) |
| `AnyClientCommand` | type | [Reference](application.md#commands-and-contracts) | [Definition](../../packages/hyapp/src/command.ts) |
| `AnyCommand` | type | [Reference](application.md#commands-and-contracts) | [Definition](../../packages/hyapp/src/command.ts) |
| `AnyServerCommand` | type | [Reference](application.md#commands-and-contracts) | [Definition](../../packages/hyapp/src/command.ts) |
| `ClientCommand` | type | [Reference](application.md#commands-and-contracts) | [Definition](../../packages/hyapp/src/command.ts) |
| `ClientCommandFactory` | type | [Reference](application.md#commands-and-contracts) | [Definition](../../packages/hyapp/src/command.ts) |
| `CommandContract` | type | [Reference](application.md#commands-and-contracts) | [Definition](../../packages/hyapp/src/command.ts) |
| `InferCommandInput` | type | [Reference](application.md#commands-and-contracts) | [Definition](../../packages/hyapp/src/command.ts) |
| `InferCommandResult` | type | [Reference](application.md#commands-and-contracts) | [Definition](../../packages/hyapp/src/command.ts) |
| `MutationTransaction` | type | [Reference](application.md#commands-and-contracts) | [Definition](../../packages/hyapp/src/command.ts) |
| `ServerCommand` | type | [Reference](application.md#commands-and-contracts) | [Definition](../../packages/hyapp/src/command.ts) |
| `ServerCommandFactory` | type | [Reference](application.md#commands-and-contracts) | [Definition](../../packages/hyapp/src/command.ts) |
| `directGatewayTransport` | value | [Reference](application.md#registries-and-gateways) | [Definition](../../packages/hyapp/src/gateway-client.ts) |
| `gatewayClient` | value | [Reference](application.md#registries-and-gateways) | [Definition](../../packages/hyapp/src/gateway-client.ts) |
| `GatewayClient` | type | [Reference](application.md#registries-and-gateways) | [Definition](../../packages/hyapp/src/gateway-client.ts) |
| `GatewayClientTransport` | type | [Reference](application.md#registries-and-gateways) | [Definition](../../packages/hyapp/src/gateway-client.ts) |
| `GatewayCommandRequest` | type | [Reference](application.md#registries-and-gateways) | [Definition](../../packages/hyapp/src/gateway-client.ts) |
| `GatewayCommandResponse` | type | [Reference](application.md#registries-and-gateways) | [Definition](../../packages/hyapp/src/gateway-client.ts) |
| `OptimisticCoordinator` | type | [Reference](application.md#registries-and-gateways) | [Definition](../../packages/hyapp/src/gateway-client.ts) |
| `OptimisticLayer` | type | [Reference](application.md#registries-and-gateways) | [Definition](../../packages/hyapp/src/gateway-client.ts) |
| `gateway` | value | [Reference](application.md#registries-and-gateways) | [Definition](../../packages/hyapp/src/gateway.ts) |
| `Gateway` | type | [Reference](application.md#registries-and-gateways) | [Definition](../../packages/hyapp/src/gateway.ts) |
| `GatewayCommands` | type | [Reference](application.md#registries-and-gateways) | [Definition](../../packages/hyapp/src/gateway.ts) |
| `GatewaySession` | type | [Reference](application.md#registries-and-gateways) | [Definition](../../packages/hyapp/src/gateway.ts) |
| `InferGatewayCommands` | type | [Reference](application.md#registries-and-gateways) | [Definition](../../packages/hyapp/src/gateway.ts) |
| `commandRegistry` | value | [Reference](application.md#registries-and-gateways) | [Definition](../../packages/hyapp/src/registry.ts) |
| `CommandRegistry` | type | [Reference](application.md#registries-and-gateways) | [Definition](../../packages/hyapp/src/registry.ts) |
| `gatewayReadRegistry` | value | [Reference](application.md#registries-and-gateways) | [Definition](../../packages/hyapp/src/registry.ts) |
| `GatewayReadRegistry` | type | [Reference](application.md#registries-and-gateways) | [Definition](../../packages/hyapp/src/registry.ts) |
| `RegistryCommandInput` | type | [Reference](application.md#registries-and-gateways) | [Definition](../../packages/hyapp/src/registry.ts) |
| `RegistryCommandName` | type | [Reference](application.md#registries-and-gateways) | [Definition](../../packages/hyapp/src/registry.ts) |
| `RegistryCommandResult` | type | [Reference](application.md#registries-and-gateways) | [Definition](../../packages/hyapp/src/registry.ts) |
| `ServerCommandRegistry` | type | [Reference](application.md#registries-and-gateways) | [Definition](../../packages/hyapp/src/registry.ts) |
| `hyapp` | value | [Reference](application.md#commands-and-contracts) | [Definition](../../packages/hyapp/src/index.ts) |

## `@hyos/hyapp/compiler`

| Export | Kind | Usage | Source |
| --- | --- | --- | --- |
| `CommandCompilationTarget` | type | [Reference](application.md#compile-shared-commands) | [Definition](../../packages/hyapp/src/compiler.ts) |
| `CompiledCommandModule` | type | [Reference](application.md#compile-shared-commands) | [Definition](../../packages/hyapp/src/compiler.ts) |
| `compileCommandModule` | value | [Reference](application.md#compile-shared-commands) | [Definition](../../packages/hyapp/src/compiler.ts) |

## `@hyos/hyapp/esbuild`

| Export | Kind | Usage | Source |
| --- | --- | --- | --- |
| `hyappCommandsPlugin` | value | [Reference](application.md#compile-shared-commands) | [Definition](../../packages/hyapp/src/esbuild.ts) |

## `@hyos/hyapp/http`

| Export | Kind | Usage | Source |
| --- | --- | --- | --- |
| `GatewayHttpError` | value | [Reference](application.md#http-server-and-browser-transport) | [Definition](../../packages/hyapp/src/http.ts) |
| `GatewaySubscriptionMessage` | type | [Reference](application.md#http-server-and-browser-transport) | [Definition](../../packages/hyapp/src/http.ts) |
| `httpGatewayTransport` | value | [Reference](application.md#http-server-and-browser-transport) | [Definition](../../packages/hyapp/src/http.ts) |

## `@hyos/hyapp/node`

| Export | Kind | Usage | Source |
| --- | --- | --- | --- |
| `createNodeGatewayHttpHandler` | value | [Reference](application.md#http-server-and-browser-transport) | [Definition](../../packages/hyapp/src/node/http.ts) |
| `NodeGatewayHttpHandler` | type | [Reference](application.md#http-server-and-browser-transport) | [Definition](../../packages/hyapp/src/node/http.ts) |

## `@hyos/hyapp/solid`

| Export | Kind | Usage | Source |
| --- | --- | --- | --- |
| `GatewaySource` | type | [Reference](application.md#solidjs) | [Definition](../../packages/hyapp/src/solid.ts) |
| `GatewayQueryState` | type | [Reference](application.md#solidjs) | [Definition](../../packages/hyapp/src/solid.ts) |
| `CommandDispatcher` | type | [Reference](application.md#solidjs) | [Definition](../../packages/hyapp/src/solid.ts) |
| `createGatewayQuery` | value | [Reference](application.md#solidjs) | [Definition](../../packages/hyapp/src/solid.ts) |
| `createCommandDispatcher` | value | [Reference](application.md#solidjs) | [Definition](../../packages/hyapp/src/solid.ts) |

## `@hyos/hyapp/wire`

| Export | Kind | Usage | Source |
| --- | --- | --- | --- |
| `WireValue` | type | [Reference](application.md#wire-values) | [Definition](../../packages/hyapp/src/wire.ts) |
| `encodeWireValue` | value | [Reference](application.md#wire-values) | [Definition](../../packages/hyapp/src/wire.ts) |
| `decodeWireValue` | value | [Reference](application.md#wire-values) | [Definition](../../packages/hyapp/src/wire.ts) |
| `stringifyWire` | value | [Reference](application.md#wire-values) | [Definition](../../packages/hyapp/src/wire.ts) |
| `parseWire` | value | [Reference](application.md#wire-values) | [Definition](../../packages/hyapp/src/wire.ts) |

