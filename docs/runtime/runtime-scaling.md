# Runtime scaling

The reproducible scenarios validate 100, 1,000, and 5,000 symbols. Duplicate input volume is
coalesced before store commit, keeping resolve and notification work proportional to unique changed
keys. Snapshot generation copies map indexes but reuses unchanged immutable visual states.

Future worker execution can use `RuntimeSerializableBatch`, a DOM-free boundary containing only a
sequence and runtime dispatch contracts. Worker transport and renderer movement are intentionally
deferred.
