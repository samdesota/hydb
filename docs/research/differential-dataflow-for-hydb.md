# Differential Dataflow foundations for HyDB

## Question

Which Differential Dataflow concepts should a TypeScript-first HyDB preserve to make optimistic local writes and policy-constrained materialized queries fast, and which parts should v0.1 defer?

## Answer in brief

HyDB should adopt Differential Dataflow's **semantic core**, not attempt a TypeScript port of its distributed runtime:

- Model every base and derived collection as a multiset changed by `(record, logicalTime, weight)` updates. An insertion has weight `+1`; a deletion or optimistic rollback has weight `-1`. Equal record/time updates consolidate by adding weights and removing zeroes.
- Compile a constrained query IR into a directed, acyclic graph of incremental operators. Preserve and test the invariant that accumulating an output's differences through time equals evaluating the query over the corresponding accumulated input.
- Maintain reusable, keyed arrangements (multiversioned indexes) for base collections and worthwhile intermediate results. Joins and reductions should consume arrangements rather than each materialized query building private indexes.
- Start with a single totally ordered authoritative revision and a separate local optimistic overlay. Partial-order timestamps and iteration are valuable chiefly when independently changing inputs are composed with recursion; the cited work does not justify that complexity for HyDB v0.1.
- Treat compaction as part of correctness. Physical batch merging may happen without changing logical history; logical time coalescing may happen only behind a frontier no reader can query. Offline replay/history retention must therefore be a separate contract from query-engine trace retention.

This subset directly supports fast local prediction and exact rollback, but the sources do **not** establish that a JavaScript implementation will meet HyDB's latency or memory goals. The first implementation needs differential-correctness tests and workload benchmarks before native code is considered.

## What the model actually promises

The original paper models a collection as a multiset: each record has an integer multiplicity. A versioned collection is reconstructed by summing all differences at times less than or equal to the requested time; a negative difference removes multiplicity. An operator is correct when its accumulated output at every time equals the ordinary operator applied to the accumulated inputs at that time. This is the central semantic invariant HyDB should retain ([Differential Dataflow paper, §3](https://github.com/TimelyDataflow/differential-dataflow/blob/master/differentialdataflow.pdf); [Shared Arrangements, §3.2–4.1](https://github.com/TimelyDataflow/differential-dataflow/blob/master/sosp2019-submission.pdf)).

The current implementation represents collections as streams of `(data, time, diff)` triples. Its difference abstraction requires addition and a zero test; negation is required by operators that retract previous output. The common case is integer multiset counts ([creating inputs](https://timelydataflow.github.io/differential-dataflow/chapter_3/chapter_3_1.html); [difference module](https://docs.rs/differential-dataflow/latest/differential_dataflow/difference/index.html); [`Abelian`](https://docs.rs/differential-dataflow/latest/differential_dataflow/difference/trait.Abelian.html)). Consolidation adds equal record/time differences and removes zero totals without changing the logical collection ([consolidate](https://timelydataflow.github.io/differential-dataflow/chapter_2/chapter_2_4.html)).

For HyDB, use signed integer weights with checked arithmetic. Public tables will normally enforce set-like multiplicities of zero or one, but derived relations must remain multisets: joins, unions, projections, and grouping can legitimately produce multiplicities greater than one.

### Optimistic prediction and rollback

The algebra gives HyDB a clean implementation mechanism; the following is a HyDB design inference, not a feature described by the papers:

1. Apply a predicted command's base-record changes to the local input collections at a new local logical time.
2. Let the dataflow propagate their derived differences.
3. Keep the exact consolidated input differences associated with the command invocation.
4. On rejection or reconciliation, inject their additive inverses. If the authoritative command produced different changes, inject those authoritative differences separately.
5. If later predictors read state produced by the changed prediction, retract those later predictions too, apply the authoritative result, and rerun them in order. Negating only the rejected command repairs its rows but does not repair causally dependent predictions.

Every correct downstream operator then retracts the prediction without a bespoke undo path. This mechanism does not decide command authorization, conflict resolution, or UI behavior; it only maintains the local replica's data and query results.

Do not model a prediction as durable truth, and do not send predicted row changes as the command's authoritative meaning. The server still reauthorizes and reruns the versioned command handler.

## Logical time and progress

Timely timestamps provide both logical ordering and a way to know which times can no longer receive data. A frontier is a set of minimal outstanding times; times no longer reachable are complete. Timely permits partially ordered timestamps so an outer input epoch and an inner loop iteration can advance independently ([Timely core concepts](https://timelydataflow.github.io/timely-dataflow/chapter_1/chapter_1.html); [Differential Dataflow paper, §3.2–3.3](https://github.com/TimelyDataflow/differential-dataflow/blob/master/differentialdataflow.pdf)). The Timely project also warns that progress tracking has non-trivial overhead per timestamp and that excessively fine time granularity can swamp it ([Timely repository, “Coarse- vs fine-grained timestamps”](https://github.com/TimelyDataflow/timely-dataflow#coarse--vs-fine-grained-timestamps)).

For v0.1:

- Use a monotonically increasing integer **authoritative revision** for committed server batches.
- On each replica, keep committed state at its server revision plus an ordered **pending-command overlay**. Pending sequence numbers are local bookkeeping, not globally comparable database revisions.
- Process one consolidated command batch per logical step. Do not use wall-clock timestamps as dataflow time.
- Expose completion only after all operators affected by a batch have drained. A single-threaded engine can implement this as an explicit scheduler queue and revision watermark; it does not need Timely's distributed capability/progress protocol.

A product timestamp such as `(serverRevision, loopIteration)` becomes justified if recursion is later admitted. A product of server revision and speculative-command identity is not required for v0.1: predictions can be applied and retracted in the replica's local total order while the stable committed snapshot remains separately identified.

## Traces, arrangements, and sharing

An arrangement is a maintained, worker-local index over update batches. It exposes both new indexed batches and a trace containing accumulated history. Operators such as join, reduce, and count can reuse the same arrangement, paying index construction and storage once ([arrangement source](https://docs.rs/differential-dataflow/latest/src/differential_dataflow/operators/arrange/arrangement.rs.html); [arrangements chapter](https://timelydataflow.github.io/differential-dataflow/chapter_5/chapter_5.html)). Traces are independent of the Timely runtime and can be imported into other dataflows ([arrange module](https://docs.rs/differential-dataflow/latest/differential_dataflow/operators/arrange/index.html)).

The shared-arrangements paper sharpens the physical design: a trace is an append-only sequence of immutable, indexed batches; the implementation continually merges batches so only logarithmically many remain. Multiple readers hold handles with time frontiers, allowing the writer to compact only history no reader can distinguish. This enabled multiple queries to share multiversioned indexes rather than each maintaining private state ([Shared Arrangements, §4](https://github.com/TimelyDataflow/differential-dataflow/blob/master/sosp2019-submission.pdf)).

HyDB should separate:

- **Trace:** immutable batches of `(key, value, time, weight)` plus lower/upper revision bounds.
- **Arrangement:** a trace indexed by a declared key and a current batch stream.
- **Handle:** a reader's arrangement reference and minimum readable revision.
- **View/materialization:** a query plan and its output arrangement, retained only while subscribed, pinned, or otherwise worth caching.

Start with in-process, single-writer arrangements. Define interfaces that do not require all state to be JavaScript object graphs, so later storage layouts can use sorted arrays, typed arrays, or native backing without changing query semantics.

### Policy-constrained views

Shared arrangements provide evidence for sharing a base index among many queries, but they do not answer HyDB's authorization design. They do show two useful patterns:

- A query relation can be semijoined against an existing arrangement, so many query sets reuse one index ([sharing across dataflows](https://timelydataflow.github.io/differential-dataflow/chapter_5/chapter_5_3.html)).
- Key-preserving filters may wrap an arrangement, while highly selective filters may be cheaper to materialize separately; the shared-arrangements authors explicitly identify this as a planner trade-off ([Shared Arrangements, §5.1](https://github.com/TimelyDataflow/differential-dataflow/blob/master/sosp2019-submission.pdf)).

The defensible HyDB hypothesis is therefore:

1. Keep authoritative base arrangements on the server, keyed by primary keys and common policy/query join keys.
2. Compile principal attributes and policy relationships into ordinary input relations where possible.
3. Derive an authorized key relation through filters/joins, then semijoin application and replica-selection queries against it.
4. Share only the server-side arrangements, never an unrestricted base trace with a replica.

Whether a policy should be a logical authorized view, a parameterized plan, or a physically materialized per-principal relation remains unresolved. Performance depends on selectivity, active-principal count, key choice, update rates, and policy shape. The policy-design session should prototype representative examples and measure at least: shared base arrangement plus semijoin, per-principal materialization, and shared membership relation keyed both by principal and record.

## Operator implications

### Stateless operators

`map`, `filter`, and concatenation can transform each incoming difference independently. Negation flips weights. These operators need no historical state unless their output is itself arranged. They are the safest v0.1 operators ([Differential Dataflow paper, §4.3](https://github.com/TimelyDataflow/differential-dataflow/blob/master/differentialdataflow.pdf)).

HyDB must not accept arbitrary JavaScript callbacks in persisted query definitions. Queries need a deterministic, serializable IR with schema-defined equality, ordering, and null semantics so server and frontend produce identical keys and results.

### Joins

Join is bilinear. For accumulated inputs `A`, `B` and new differences `a`, `b`, the output change is `A ⋈ b + a ⋈ B + a ⋈ b`; therefore each input needs an arrangement that new updates can probe. The implementation still retains both input traces, but work can be localized to affected keys ([Differential Dataflow paper, §4.3](https://github.com/TimelyDataflow/differential-dataflow/blob/master/differentialdataflow.pdf)). The current API likewise defines joins over keyed collections and multiplies input weights ([`Collection.join`](https://docs.rs/differential-dataflow/latest/differential_dataflow/collection/struct.Collection.html)).

For v0.1, support equijoins and semijoins over explicit scalar or tuple keys. Require arrangements on join keys and consolidate output batches. Defer outer joins and general predicates until their retraction and null semantics are specified and tested.

### Reductions

Reductions group values by key and emit changes relative to prior output. Count and sum can retain compact per-key accumulators. Min and max must retain the full per-key input multiset because retracting the current extreme exposes the next one ([Differential Dataflow paper, §4.3](https://github.com/TimelyDataflow/differential-dataflow/blob/master/differentialdataflow.pdf)). The implementation's general `reduce` receives sorted `(value, accumulatedWeight)` inputs for a key and produces weighted outputs ([reduce source](https://docs.rs/differential-dataflow/latest/src/differential_dataflow/operators/reduce.rs.html); [`Collection.reduce`](https://docs.rs/differential-dataflow/latest/differential_dataflow/collection/struct.Collection.html)).

Ship specialized `distinct`, `count`, `sum`, `min`, and `max`, with explicit empty-group and numeric semantics. A general user-supplied reduce is too large a correctness and performance surface for v0.1. Ordering and top-k/limit also require maintained ordered state and deterministic tie-breaking; defer them unless an initial product query proves essential.

### Recursion

Differential Dataflow's distinctive partial-order machinery allows updates and nested iterations to coexist. `iterate` repeatedly applies a dataflow fragment until no differences remain ([paper, §3.2–4](https://github.com/TimelyDataflow/differential-dataflow/blob/master/differentialdataflow.pdf); [`Iterate`](https://docs.rs/differential-dataflow/latest/differential_dataflow/operators/iterate/trait.Iterate.html)). That requires product timestamps, progress/frontier tracking through cycles, convergence rules, and long-lived histories across loop iterations.

HyDB's stated v0.1 workloads—policy filtering, joins, materialized UI queries, and optimistic command propagation—do not yet require recursion. Keep the IR graph acyclic and reject recursive plans. Preserve `logicalTime` as an abstraction rather than hard-coding wall time, but do not implement nested scopes or partial-order frontiers speculatively.

## Compaction and retention

Differential traces distinguish two operations:

- **Physical compaction** merges batches without changing which historical times can be observed.
- **Logical compaction** coalesces times once all handles promise not to query before a frontier. Holding an old trace handle prevents this compaction ([sharing across dataflows](https://timelydataflow.github.io/differential-dataflow/chapter_5/chapter_5_3.html); [`TraceReader`](https://docs.rs/differential-dataflow/latest/differential_dataflow/trace/trait.TraceReader.html)).

HyDB should maintain a low watermark for each trace based only on live query-engine readers. Once it advances, updates before the watermark may consolidate into a checkpoint at the watermark. Stalled subscriptions need an explicit eviction/resubscribe path so they cannot pin all history indefinitely.

Do not make query traces the authoritative command log or offline-replay log. A reconnecting replica may need a retained change feed or a fresh snapshot even after the query engine has compacted old logical times. Conversely, an offline command should carry the base revision needed by command/conflict semantics, not a capability to query every old dataflow version. The synchronization and storage designs must choose retention windows and snapshot fallback independently.

## JavaScript and TypeScript risks

These are engineering risks to measure, not evidence that TypeScript is unsuitable:

1. **Canonical data semantics.** Differential's Rust `Data` contract relies on total ordering so equal updates can be sorted and cancelled; keyed operators also rely on stable hashing ([`Data`](https://docs.rs/differential-dataflow/latest/differential_dataflow/trait.Data.html); [`Hashable`](https://docs.rs/differential-dataflow/latest/differential_dataflow/hashable/trait.Hashable.html)). JavaScript object identity and user callbacks are not an adequate database equality/order contract. Restrict query keys and stored values to schema-defined canonical types; implement one canonical comparator, encoder, and stable hash used on both backend and frontend.
2. **Integer precision.** ECMAScript `Number` cannot represent every integer beyond `Number.MAX_SAFE_INTEGER`; revisions and weights therefore need checked safe-integer bounds or `BigInt` ([ECMAScript `Number.MAX_SAFE_INTEGER`](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-number.max_safe_integer)). `BigInt` has serialization and typed-storage trade-offs, so benchmark it before choosing it for hot-path weights.
3. **Allocation and locality.** A literal object per `(record,time,weight)` and nested `Map` indexes may create allocation and garbage-collection pressure. Use consolidated command batches first, instrument allocation and pause time, and preserve a path toward sorted/columnar batches. Do not select Rust, Zig, or WebAssembly without measurements from representative HyDB workloads.
4. **Parallelism and movement.** Browser and Node workers cross realm boundaries through structured cloning unless data is represented in transferable/shared buffers; not all values are transferable ([HTML structured data](https://html.spec.whatwg.org/dev/structured-data.html); [Node worker threads](https://nodejs.org/api/worker_threads.html)). Start single-threaded. Adding workers before a compact batch representation may copy more data than it usefully processes.
5. **Determinism.** Persisted query plans must not observe time, randomness, I/O, locale-dependent comparison, mutable closure state, or engine-specific iteration accidents. Define operators in IR and test backend/frontend equivalence against the same update sequences.
6. **Durability.** The cited arrangements are maintained in-memory query state, not HyDB's durable storage protocol. Rebuildable traces can initially be derived from a durable authoritative log/snapshot on the server and IndexedDB replica state in the browser; persistence of arrangements is a later storage decision.

## Recommended v0.1 boundary

Implement and specify:

- schema-defined relational collections with signed integer multiplicities;
- input/update batches `(record, revision, weight)` and deterministic consolidation;
- a totally ordered authoritative revision plus per-replica pending prediction overlay;
- exact prediction retraction, authoritative replacement, and ordered rerunning of causally later predictions using retained source differences and command inputs;
- acyclic query plans with projection/map, filter, concat/union-all, negate/internal subtraction, equijoin, semijoin, distinct, count, sum, min, and max;
- reusable arrangements for primary keys, join keys, and selected materialized outputs;
- physical batch merging, handle/frontier tracking, logical compaction, and snapshot rebuild boundaries;
- deterministic canonical encoding, equality, order, and hashing across Node and browser;
- reference recomputation tests for every operator and randomized sequences including inserts, deletes, duplicate weights, prediction rollback, and reconciliation;
- benchmarks covering local optimistic propagation, fan-out to active queries, join/reduction updates, policy-shaped semijoins, memory growth, compaction, and query installation from shared arrangements.

Explicitly defer:

- recursive/iterative queries and partially ordered/product timestamps;
- distributed workers, Timely-style distributed progress tracking, and sharded arrangements;
- arbitrary JavaScript query or reduction callbacks;
- outer/non-equijoins, general top-k/order/limit, and exotic difference semirings;
- durable/persistent arrangements and a native/Wasm implementation.

## Decisions this research enables—and does not make

The evidence supports using differential updates and shared arrangements as HyDB's query-engine foundation, and supports an acyclic, total-time TypeScript subset for v0.1. It also identifies exact seams—logical time, trace, arrangement, handle, batch storage—where later recursion, persistence, workers, or native acceleration can attach.

It does **not** settle:

- the shape or physical materialization strategy of authorized views;
- replica selection and synchronization retention contracts;
- command predictor/handler code sharing;
- the exact storage layout or whether measured hot paths warrant native code.

Those decisions need representative Hyos examples and prototypes rather than further inference from Differential Dataflow.
