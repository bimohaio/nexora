# Runtime events

`RuntimeEventBus` is a synchronous typed event bus for pipeline observability. Supported event names
include runtime updates, snapshots, rendering, simulation, subscriptions, and lifecycle:

- `RuntimeUpdated`, `SnapshotChanged`, `RenderStarted`, `RenderCompleted`
- `SimulationStarted`, `SimulationStopped`
- `SubscriptionCreated`, `SubscriptionDisposed`
- `RuntimeStarted`, `RuntimePaused`, `RuntimeResumed`, `RuntimeStopped`, `RuntimeDisposed`

TypeScript maps each event name to its specific immutable payload.

```ts
const events = new RuntimeEventBus();
const subscription = events.on("SimulationStarted", ({ timestamp }) => {
  console.log(timestamp);
});
subscription.unsubscribe();
```

Subscriptions are idempotently removable. Listener failures are isolated so observers cannot stop
the runtime loop. `clear()` removes listeners and `dispose()` permanently closes the bus.

The event bus is for lifecycle observability. Runtime data consumers should use
`RuntimeSubscriptionManager`, which adds symbol/property/change filtering and immutable snapshot
observations.
