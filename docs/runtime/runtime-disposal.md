# Runtime disposal and ownership

## Ownership

```text
Application
  |
  +-- Runtime Engine
  |     +-- internally-created store
  |     +-- subscription manager
  |     +-- provider subscriptions
  |     +-- refresh/reconnect callbacks
  |
  +-- Renderer
  |
  +-- optional caller-owned store/provider
```

The engine disposes resources it creates. A store injected by the application remains
caller-owned. Renderer resources are not stored in runtime subscriptions and must be disposed by
their application owner.

`SubscriptionHandle.dispose()` is synchronous and idempotent. It removes the observer reference
immediately. `RuntimeSubscriptionManager.dispose()` closes all active handles, clears listener
records, and rejects later registration.

`RuntimeLifecycleManager` can own arbitrary `RuntimeDisposable` resources. Disposal:

1. stops a running or paused lifecycle;
2. disposes registered resources in reverse registration order;
3. continues cleanup if one resource fails;
4. runs the lifecycle disposal hook;
5. enters `disposed` and emits `RuntimeDisposed`.

The first cleanup error is rethrown only after all resources have been attempted.

Engine disposal additionally cancels scheduler callbacks, removes provider/store subscriptions,
clears pending queues, disconnects the provider, closes runtime observers, and releases legacy
listeners. No notification is delivered after the relevant handle or manager is disposed.
