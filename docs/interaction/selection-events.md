# Selection events

Transitions emit events in deterministic order:

```text
selection-changing
  -> selection-added
  -> selection-removed
  -> selection-cleared
  -> primary-selection-changed
  -> selection-changed
```

Only applicable specific events are emitted. `selection-changing` observers may
cancel before state is replaced. Observers support type filtering, descending
priority, stable registration order, one-time subscriptions, explicit
unsubscription, and idempotent disposal.

Every event includes immutable previous and proposed/current state plus ordered
added and removed targets. No event is emitted for a structurally identical
request.
