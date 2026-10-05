# ADR 0026: Explicit semantic command merging at the History boundary

Status: Accepted

## Context

Repeated move, resize, nudge, and property operations can create excessive history entries. Merging
based only on adjacency, type names, or time would risk corrupting undo/redo and transaction behavior.

## Decision

History Engine orchestrates automatic tail compression. Commands opt in with an immutable merge
descriptor and the existing `canMergeWith` semantic capability. History additionally checks target
sets, groups, continuity, barriers, policy, and optional timestamps. Merged entries use a compact
before/after snapshot command, preserving earliest undo and latest redo semantics without retaining
intermediate commands.

No-op removal requires an optional command-owned equality function. Merge failures retain both
operations with a typed diagnostic. Compression precedes history-limit enforcement. Transaction
tails may compress, while committed transaction boundaries remain barriers.

## Alternatives

- A global strategy registry was rejected because current commands already expose a capability and
  the initial command families do not justify a second extension mechanism.
- Type-name or arbitrary-object inspection was rejected as unsafe.
- Full-stack compression was rejected because adjacent logical operations provide near-O(1) append.
- JSON equality was rejected because geometry/property semantics belong to their domain commands.

## Consequences and compatibility

The API change is additive (`MINOR`). Existing commands remain non-mergeable and retain prior stack
behavior. Persisted documents and Core command fields are unchanged. Designer move/nudge and
single-node resize now opt in; rotation is absent and opaque property callbacks remain conservative.

## Testing and future extension

Deterministic tests cover compatibility, targets, groups, timing, no-ops, barriers, transactions,
failure fallback, limits, real Designer commands, undo/redo, and a 10,000-candidate diagnostic.
Future typed property/rotation commands can implement the same capability without changing History.
