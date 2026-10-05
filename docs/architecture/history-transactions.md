# History Transactions

## Ownership and lifecycle

History Engine owns a single active transaction accumulator. Core commands remain
the only mutation protocol; Designer owns its document and transient editor state.
No transaction data is serialized into `ScadaDocument`, and History imports no
renderer, DOM, framework, protocol, or runtime package.

```text
Designer executeTransaction
        |
        v
History begin -> command A -> command B -> commit
        |                                  |
        |                            one HistoryEntry
        |                                  |
        +----------------------- undo stack / redo stack
                                           |
                                  reverse undo / forward redo
                                           |
                              document + DocumentChangeSet
```

A handle moves deterministically through `active` to `committed`, `cancelled`,
or `failed`. IDs and entry ordering use engine-local integer sequences, never
wall-clock time. Nesting is rejected. A completed, failed, stale, or disposed
handle cannot mutate history.

## Commit and cancellation

Commands execute once while active and immutable operation records accumulate
outside the public stacks. Commit validates reversibility and document-chain
continuity, then publishes all operations as one entry. It does not re-execute
commands. Empty commit creates no entry; successful non-empty commit clears a
stale redo branch exactly once. Retention counts and evicts the complete entry,
so a transaction is never partially retained.

Cancel discards the accumulator only. Generic History cannot atomically replace
the caller-owned document, so it does not claim rollback. Designer's
`executeTransaction()` executes the chain locally and publishes its document and
combined change set only after commit; a thrown command therefore leaves the
Designer document unpublished and cancels the grouping.

## Undo, redo, and failures

For `A, B, C`, undo invokes `undo(C), undo(B), undo(A)` and redo invokes
`redo(A), redo(B), redo(C)`. The Phase 11.01 engine holds stack transitions until
the complete loop succeeds. Because documents are immutable return values, an
intermediate result remains local when a later command fails: the public result
returns the original document, stack depths and revision stay unchanged, and a
typed diagnostic reports the direction. Side effects inside a command would
violate the existing Core command contract and cannot be rolled back by History.

Forward/inverse `DocumentChangeSet` values use Core's `mergeChangeSets`. When a
complete set is unavailable, the owner-provided neutral derivation adapter
compares the transaction's input and output documents. Renderer invalidation
remains downstream of Designer.

## Revisions and events

- begin: one `transaction-started` revision/event;
- operation collection: no public revision/event;
- commit: one `transaction-committed` revision/event;
- cancel: one `transaction-cancelled` revision/event;
- validation failure: one `transaction-failed` revision/event;
- transaction undo/redo: the normal single Phase 11.01 transition.

Advanced rollback orchestration, nesting, merging/compression, clipboard,
selection restoration, and keyboard routing are intentionally deferred.
