# Phase 11 — History

## Goal

Add undo/redo and transaction history for deterministic Designer Engine editing.

## Scope

Command history, transactions, coalescing, inverse operations or snapshots,
gesture boundaries, dirty state, and history limits.

## Deliverables

History service, Designer integration, transaction diagnostics, and persistence
policy.

## Public APIs

Phase 11.00 establishes `@web-scada/history-engine`: `HistoryEngine`, immutable
entry/state/options contracts, transaction and merge foundations, JSON-safe
restoration metadata, typed errors, and framework-neutral subscriptions. The
existing Designer `CommandHistory` name remains as a compatibility adapter.

History is transient editor state and is not persisted with `ScadaDocument`.
Phase 11.03 adds explicit semantic command merging, transaction-tail compression,
merge barriers, proven no-op removal, failure diagnostics, and move/resize Designer
integration. Clipboard formats and selection restoration behavior remain later Phase 11 work.

Phase 11.04 adds bounded-by-default logical undo retention, oldest-first atomic pruning, optional
deterministic estimated-cost budgets, incremental retention statistics, redo-reference cleanup, and
lifecycle accounting. Designer construction accepts transient `history` options; no history data is
added to `ScadaDocument`.

See also [command merging architecture](../architecture/history-command-merging.md),
[ADR 0026](../adr/0026-command-merging-and-history-compression.md), and
[ADR 0027](../adr/0027-history-retention-and-memory-budget.md).

## Dependencies

Phase 05 editing commands, Designer Engine state, domain events, and immutable
documents.

## Testing

Undo/redo round trips, failed commands, transaction boundaries, gesture
coalescing, memory limits, and document identity.

## Definition of Done

Accepted editing operations can be undone and redone deterministically without
recording transient pointer frames.

## Exit Criteria

History semantics, limits, API review, and integration tests pass.

See also:

- [Command-based editing ADR](../adr/0008-use-command-based-editing.md)
- [Mutation model](../architecture/mutation-model.md)
- [Phase 05 Editing](phase-05-editing.md)
