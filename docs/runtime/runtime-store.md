# Runtime Store

`InMemoryTagStore` normalizes untrusted `RuntimeDataPointInput` into immutable JSON-safe
`RuntimeDataPoint` values. `updateMany` validates an entire batch, commits accepted changes as one
revision, creates a `RuntimeChangeSet`, invalidates the cached snapshot, and isolates subscribers.

The store owns runtime values and subscription delivery. Callers own input objects and must treat
returned snapshots as read-only. Duplicate keys, invalid timestamps, invalid quality, cyclic
objects, and unsafe keys produce typed diagnostics. Disposal closes subscriptions and rejects
further writes.
