# Runtime lifecycle and scheduling

## Validated component lifecycle

```text
initialize
    |
    v
  idle ----start----> starting ----> running
                                      |   ^
                                   pause resume
                                      v   |
                                     paused
                                      |
                                     stop
                                      v
                                   stopping ----> stopped

Any stable state -------------------------------> disposed
```

`RuntimeLifecycleManager` supplies `initialize`, `start`, `pause`, `resume`, `stop`, and `dispose`.
`start()` initializes lazily and permits restart from `stopped`. Illegal or overlapping transitions
throw `RUNTIME_LIFECYCLE_INVALID`. Repeated `initialize`, `stop` after stopping, and `dispose` after
disposal are safe no-ops.

Lifecycle hooks may be synchronous or asynchronous. Optional `RuntimeEventBus` integration emits
`RuntimeStarted`, `RuntimePaused`, `RuntimeResumed`, `RuntimeStopped`, and `RuntimeDisposed`.
Registered `RuntimeDisposable` resources are owned until explicitly unregistered or lifecycle
disposal.

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
foundation consumers and tests. The manual scheduler also implements the
engine timer/clock adapter and provides `flushOne()`/`flushAll()`. Tasks can be canceled or flushed;
disposal cancels pending work; task failures are isolated.

Animation-frame runtime delivery is provided by `RuntimeFrameScheduler`; provider refresh and
reconnection continue to use the injected timer scheduler.

## Visual commits and reentrancy

Synchronous raw updates are accumulated by affected tag ID. `flush()` or the
scheduled refresh callback resolves final values and publishes at most one
visual commit. Updates dispatched by a commit listener enter the next flush
because the pending set is cleared before listeners run. A nested empty flush
is a no-op.

`dispose()` cancels pending work before clearing subscriptions. Operations that
could commit after disposal throw `RUNTIME_DISPOSED`; previous snapshots remain
safe to read.
