# ADR 0027: History retention and estimated-memory budget

## Status

Accepted.

## Decision

History is bounded by default to 100 logical undo entries. The immutable `maxEntries` policy counts
the undo stack, preserving the established contract. Entries move to redo without becoming new
operations. New commits discard redo, then apply oldest-first pruning after transaction grouping and
semantic compression.

An optional `maxEstimatedBytes` budget is supported only with an injected deterministic
`HistoryCostEstimator`. History does not guess object or heap sizes. It incrementally tracks each
immutable logical entry and re-estimates replacement entries after merging. Invalid estimates fail
safe at zero with a warning. A newest oversized atomic entry is retained and warned; older entries
are removed. Correct undo of a committed operation takes priority over splitting or dropping it.

## Consequences

- Transactions and composite operation arrays remain atomic during pruning.
- Append and stack movement remain O(1), and pruning is O(number removed).
- Redo deletion, no-op compression, clear, and dispose release entry/cost references.
- Policies are construction-time only; runtime reconfiguration is unsupported.
- Memory figures are application-defined estimates, never exact JavaScript heap use.
