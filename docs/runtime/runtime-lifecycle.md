# Runtime lifecycle and scheduling

## Store lifecycle

```text
create -> update/updateMany -> snapshot/notify -> dispose
```

`subscribeChanges` returns a stateful `RuntimeSubscription`. Unsubscribe is
idempotent. Listener order is registration order. Dispatch uses a stable
listener snapshot: listeners added during dispatch start on the next commit,
while self-unsubscription affects future commits. Listener failures are
isolated and reported through typed diagnostics. Reentrant writes are rejected
with `RUNTIME_REENTRANT_UPDATE`.

Store disposal closes all subscriptions and rejects later writes. Reads and the
last immutable snapshot remain available for post-mortem inspection.

## Provider engine lifecycle

```text
idle -> connecting -> running
                    -> reconnecting -> running
running -> stopped -> connecting
any state -> disposed
```

The engine cancels batch, freshness, and reconnect timers; removes store,
provider, and provider-status subscriptions; and disconnects the provider.
Only an internally created store is disposed. Caller-owned stores remain owned
by the caller.

## Scheduling

Provider-to-visual invalidation uses injected `RuntimeScheduler` timers and
`refreshInterval`. `ImmediateRuntimeScheduler` and
`ManualRuntimeScheduler` provide deterministic generic task scheduling for
foundation consumers and tests. Manual tasks can be canceled or flushed;
disposal cancels pending work; task failures are isolated.

No per-key loop, worker, or animation-frame policy exists in Phase 6.00.
