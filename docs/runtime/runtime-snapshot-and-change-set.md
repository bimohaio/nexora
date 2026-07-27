# Runtime snapshots and change sets

## Revision

Each store starts at revision `0`. A coherent changed commit increments the
instance-local safe integer once. No-op writes, invalid atomic batches, missing
removals, and clearing an empty store do not increment revision. A batch of
10,000 changed keys still produces one revision.

Revision is not global and is not persisted. Long-running overflow beyond
JavaScript safe integers is a future production-hardening concern.

## Snapshot

`RuntimeSnapshot` contains revision, snapshot timestamp, size, and read-only
`has`, `get`, and `getAll` operations. It never exposes the internal `Map`.
Points and nested JSON data are frozen defensive copies.

Repeated `snapshot()` calls at the same revision return the same cached snapshot.
A later commit invalidates the cache. Older snapshots remain isolated from later
writes.

## Change set

Each changed commit creates one `RuntimeChangeSet` containing:

- previous and current revision;
- commit timestamp;
- deterministic sorted added, updated, and removed keys;
- immutable per-key changes with previous/current values where applicable.

Runtime change sets are separate from `DocumentChangeSet`: the former describes
ephemeral values, while the latter describes persisted design mutations.
