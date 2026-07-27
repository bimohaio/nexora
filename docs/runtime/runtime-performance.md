# Runtime performance

Runtime updates are accumulated by key for one scheduled frame, merged deterministically, resolved
once, committed to an immutable incremental snapshot, and dispatched once. `RuntimeBatchQueue`
coalesces tag inputs; `RuntimeUpdateQueue` coalesces symbol changes. Both preserve first-insertion
order while using the configured winner.

Optimizations include one outstanding frame callback, stable keyed maps, cached metric snapshots,
bounded object pools for internal temporary objects, structural reuse of unchanged visual states,
and incremental renderer diffs. Snapshot immutability and listener ordering are unchanged.
