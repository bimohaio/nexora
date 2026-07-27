# ADR 0021: Use normalized runtime snapshots and change sets

## Status

Accepted

## Context

The initial Phase 6 provider pipeline supported ephemeral tag values and
targeted visuals but lacked a revisioned raw snapshot and runtime-specific
change contract. Exposing the internal mutable map or reusing
`DocumentChangeSet` would violate ownership and incremental-update boundaries.

## Decision

Normalize every canonical ingestion input into a frozen JSON-safe
`RuntimeDataPoint`. Use an instance-local monotonic revision, a cached custom
read-only snapshot, and one immutable added/updated/removed change set per
atomic commit. Preserve the ISO `RuntimeValue` provider shape as a compatibility
adapter. Reject older source timestamp/sequence updates and reentrant writes.

## Alternatives

- Expose `ReadonlyMap`: rejected because TypeScript readonly does not prevent
  runtime mutation.
- Deep-clone a full map on every read: rejected because it adds avoidable cost.
- Reuse `DocumentChangeSet`: rejected because runtime and design lifecycles
  differ.
- Replace the provider contract immediately: rejected as an unnecessary
  breaking change.

## Consequences

Future Binding Engine code receives deterministic snapshots and small change
sets. Existing providers and the demo keep working. Store memory retains only
current state plus one cached snapshot; historical snapshots remain owned by
their callers.

## Migration

Existing `set`, `setMany`, `get`, `getAll`, and provider `RuntimeValue` calls
remain supported. New consumers should prefer `update`, `updateMany`,
`snapshot`, and `subscribeChanges`.

## References

- [Runtime documentation](../runtime/README.md)
- [Phase 6.00 audit](../runtime/phase-6-00-audit.md)
