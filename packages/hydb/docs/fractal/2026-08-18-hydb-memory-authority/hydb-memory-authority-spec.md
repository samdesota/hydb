# HyDB In-Memory Authority

## Seed

Build HyDB's adapter-neutral authoritative storage semantics and an in-memory
implementation that serves as the correctness oracle for every later adapter:
schema-aware atomic mutations, immutable snapshot reads, deterministic
constraint failures, strictly ordered commits, and replayable commit history.
Durability, queries, transactors, synchronization, and live maintenance remain
outside this ticket.

## Solution

- Boundary: keep adapter contracts and conformance tests in `@hyos/hydb` under
  `storage`, with the memory implementation under `storage-memory`; defer
  workspace-package splitting until the public package map stabilizes.
- Reads: storage owns primary-key lookup, ordered table scan, and ordered index
  range-scan requests; Ticket 03 compiles queries into these primitives.
- Ordering: extend the schema codec with canonical scalar and compound index-key
  encoding so every adapter shares identical ordering semantics.
- State: use immutable snapshot handles over copy-on-write primary tables and
  secondary indexes; an acquired snapshot remains valid after history pruning.
- Transactions: serialize authoritative writers FIFO; each transaction reads its
  own draft and atomically publishes only after its callback and validation pass.
- Constraints: reject invalid operations immediately, validate unique and
  foreign-key constraints against the final draft, and choose failures in stable
  table, constraint, and key order.
- Commits: start at `0n`; every successful transaction, including a no-op,
  receives the next version and a frozen batch of coalesced, canonically sorted
  before/after changes.
- History: retain committed roots and batches under a configurable count limit,
  default to unbounded memory history, and return a typed resnapshot-required
  error for pruned versions or replay cursors.
- Conformance: export one black-box adapter-factory suite for CRUD,
  read-your-writes, rollback, snapshots, constraints, ordering, FIFO concurrency,
  commits, replay, and retention; capability-gate durability-only checks.
