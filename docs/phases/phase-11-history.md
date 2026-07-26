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

TODO: no accepted history API exists. SCADA Core `Command` and immutable mutation
results are prerequisites, not a complete history contract.

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
