# Command merging and semantic history compression

## Ownership and flow

Core owns the reversible `Command` protocol and immutable design documents. History Engine owns the
merge decision and stack mutation. Designer commands may expose domain-specific compatibility but do
not manipulate history stacks.

```text
execute command → immutable operation → active transaction or committed tail
→ barrier/policy/descriptor checks → command-owned compatibility
→ merge or separate → proven no-op removal → entry limit
```

Ordinary recording compares only the latest eligible entry, so work is constant relative to history
depth. Transaction recording compares only its current tail. No full-stack or JSON-shape scan occurs.

## Compatibility and metadata

Both operations require explicit `HistoryMergeMetadata` and successful `canMergeWith`. Keys, command
kinds, sorted target IDs, group IDs, document continuity, and an optional time interval must agree.
Time never establishes semantic compatibility by itself. Structural and opaque callback commands are
non-mergeable by default.

A merged operation retains the original command ID/metadata, the latest timestamp, the earliest
document and restoration-before value, and the latest document and restoration-after value. Its
snapshot command undoes directly to the earliest state and redoes directly to the latest state; no
intermediate documents or command chain is retained.

## Barriers and transactions

Undo, redo, clear, transaction lifecycle, explicit checkpoints, selection changes, and tool changes
close the current merge sequence. A transaction compresses its own adjacent operations before
committing one atomic entry. Cancellation releases its accumulator. Nested transactions retain the
existing rejection policy.

## Failure and lifecycle

Merge exceptions degrade compression, not correctness. Both commands remain separately undoable, a
typed warning is attached to the later entry, and a failure counter advances. Disposal clears stacks,
transaction state, listeners, and merge eligibility. History remains editor-only and has no renderer,
runtime transport, browser, or framework dependency.
