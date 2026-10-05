# History Engine

The framework-neutral History Engine owns deterministic undo/redo, atomic transactions, entry
limits, and semantic command compression. Serialized `ScadaDocument` data never contains history.

Commands opt into merging through `HistoryMergeableCommand.historyMerge` and their existing
`canMergeWith` capability. History checks the descriptor key, command kind, ordered target set,
optional group, document continuity, optional timestamp interval, barriers, and command-owned
compatibility before replacing the tail. It never guesses from arbitrary command data.

```ts
const history = new HistoryEngine({
  maxEntries: 100,
  maxEstimatedBytes: 2_000_000,
  costEstimator: { estimate: (entry) => estimateApplicationHistoryCost(entry) },
  compression: { enabled: true, removeNoOps: true, maxIntervalMs: 500 }
});
```

Automatic compression happens before entry-limit enforcement and only examines the latest eligible
entry or transaction tail. The merged operation keeps the earliest document/restoration-before and
latest document/restoration-after. Forward/inverse change sets are re-derived when an adapter is
configured. A command-specific `isHistoryNoOp` capability is required before an entry can be removed.

Undo, redo, clear, explicit `createMergeBarrier`, transaction begin/commit/cancel, selection changes,
and tool changes establish barriers. Transactions may compress compatible adjacent operations
internally but remain one atomic entry and never merge across commit. A thrown compatibility check or
compression failure retains both commands and records `HISTORY_MERGE_FAILED` on the new entry.

`compressionStatistics` exposes immutable merge, no-op removal, and failure counts. `dispose` clears
both stacks, active transaction state, merge eligibility, and listeners. Rotation is not currently a
Designer command. Generic `UpdateNodeCommand` accepts an opaque callback, so same-property merging is
available through the public History capability but is not inferred by Designer.

## Retention and memory management

`maxEntries` is an immutable construction-time limit on logical **undo entries** and defaults to
`100`; redo entries are the same retained entries moved between stacks. Values must be non-negative
safe integers. `0` means commands execute but no undo entry is retained. There is no magic-number
unlimited mode, and runtime reconfiguration is deliberately unsupported.

Retention runs after transaction grouping and merge/no-op compression. Overflow removes complete
logical entries oldest first, so transactions are never split and pruning never changes the current
document. Undo stops at the resulting boundary. A divergent command immediately releases the whole
redo branch and establishes a merge boundary.

Applications with a stable domain-specific estimate may supply both `maxEstimatedBytes` and a
`HistoryCostEstimator`. The estimate must be deterministic, finite, and non-negative; it is an
accounting unit called bytes, not a claim about JavaScript heap size. Invalid or throwing estimates
fail safe at zero and diagnose `HISTORY_COST_ESTIMATION_FAILED`. A newest atomic entry that alone
exceeds the budget is retained and diagnosed with `HISTORY_OVERSIZED_ENTRY_RETAINED`; older entries
are still pruned. History performs no serialization or heap inspection.

`retentionStatistics` is a frozen snapshot of undo/redo counts, split and total estimated cost,
lifetime pruning/redo-discard counts, and estimation failures. Accounting is incremental: ordinary
append and stack movement are O(1), while pruning k entries is O(k). Merged entries are re-estimated.
`clear()` releases entries and current byte counters while preserving lifetime counters and is
rejected during a transaction. `dispose()` also cancels transaction buffers, removes listeners, and
resets all retention accounting.

`@web-scada/history-engine` owns transient editor command history. It builds on
the public Core `Command`, `ScadaDocument`, and `DocumentChangeSet` contracts;
it does not define a second document mutation path.

## Ownership and boundaries

- Core owns the persisted, immutable `ScadaDocument`.
- History Engine owns undo/redo stacks, deterministic sequence numbers,
  transaction state, retention limits, subscriptions, and lifecycle.
- Designer Engine owns selection, clipboard, tools, gestures, and restoration
  adapters. Renderer and runtime packages do not depend on History Engine.
- History is transient and is never serialized into `ScadaDocument`.

Public inputs are treated as readonly. Stack arrays remain private. Entry and
state snapshots are frozen, and logical ordering uses an engine sequence rather
than timestamps. Commands remain the existing reversible Core contract; an
operation without that contract cannot be recorded as an undoable operation.
Optional `DocumentChangeSet` data describes a mutation without replacing Core.

## API and configuration

```ts
const history = new HistoryEngine({ maxEntries: 100 });
const next = history.execute(command, document);
const subscription = history.subscribe(({ state }) => updateButtons(state));
```

`executeUndo()` and `executeRedo()` return an immutable typed result with
`applied`, `not-available`, or `failed` status, the resulting document, the
executed entry, diagnostics, the atomic history-state snapshot, and an optional
`DocumentChangeSet`. The legacy `undo()`/`redo()` document-returning methods are
retained for compatibility and throw typed `HistoryError` on execution failure.

The engine peeks before executing and moves an entry only after every command
succeeds. Undo reverses operation order; redo uses original order. A failure or
document-identity mismatch leaves both stacks and the history revision intact.
After undo, recording a divergent edit clears the complete redo branch. Empty
undo/redo is a harmless `not-available` result and does not emit or increment
revision.

Core commands currently return documents only. An owner such as Designer may
provide the renderer-neutral `deriveChanges(previous, next)` option. History
stores frozen forward/inverse change sets and returns them during replay;
Designer remains responsible for forwarding them to its renderer adapter.

```text
Designer -> Core Command -> History entry
   ^                          | undo stack | redo stack
   |                          v
document + change set <- command undo/redo
```

Observers receive `undone` and `redone` only after the stack, revision, and
state are committed. Execution is synchronous and guarded against command-time
reentrancy. History is tied to the logical document object chain it records, so
an unrelated document is rejected rather than mutated accidentally.

`maxEntries` counts logical undo entries only and defaults to `100`. It must be
a non-negative safe integer. Zero permits events/sequencing but retains no undo
entries. Recording after undo discards the redo branch. Overflow evicts the
oldest logical entry; a transaction is one entry and is therefore evicted
atomically.

Transactions are explicit and non-nestable. Recorded operations remain pending
until `commit()` creates one logical entry; `cancel()` discards only the pending
history grouping and creates no entry. It does not claim to roll back documents
already accepted by an external owner.

```ts
const transaction = history.beginTransaction({
  label: "Align nodes",
  metadata: { targetIds: ["node-a", "node-b"] }
});
let next = history.execute(commandA, document);
next = history.execute(commandB, next);
const result = transaction.commit();
```

Handles expose `active`, `committed`, `cancelled`, or `failed` state. Empty
commit creates no entry and does not invalidate redo. A non-empty successful
commit invalidates redo once, retains forward order, and counts as one unit for
retention/eviction. Undo applies inverses in reverse order; redo applies commands
in forward order. Options, metadata, entry operations, and results are frozen.
Discontinuous or non-reversible untyped operation sequences fail commit without
changing either history stack.

Beginning, committing, cancelling, or failing a transaction is one observable
revision each; collecting operations is not. A committed transaction emits one
`transaction-committed` event rather than separate recorded/committed events.
Nested transactions, undo/redo, and clear are rejected while a transaction is
active. `dispose()` is idempotent, cancels the active handle, clears retained
operations/stacks, emits one final event, and removes listeners.

Merge metadata is only a semantic extension seam: Phase 11.00 performs no
merging. Future merging must require compatible neighboring operations and may
not rely on timing alone. Compression is separate: it may reduce retained
representation only while preserving undo/redo behavior.

Restoration metadata is JSON-safe and UI-neutral. Designer may later interpret
its before/after values to restore selection; History never calls selection
APIs. Clipboard validation/remapping remains in Designer/application code and
must produce commands before history records paste/cut/duplicate. Keyboard
routing likewise maps keys to semantic actions above History. Gesture previews
are transient; only the final committed command is recorded.

## Current limitations

History-level cancel is grouping cancellation, not document rollback. Designer's
`executeTransaction()` strengthens its own boundary by executing against a local
document chain and publishing once only after commit. Recovery from side effects
inside non-conforming commands remains outside History. Command merging,
compression, selection restoration behavior, and clipboard formats remain
deferred.

Run `pnpm vitest run packages/history-engine/src/engine.test.ts` and
`pnpm --filter @web-scada/history-engine build` for focused verification.
