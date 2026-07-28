# Data-source simulator

`@web-scada/datasource-simulator` is the reference adapter for the normalized
data-source contracts. It depends only on `core` and `datasource-core`.

```ts
const simulator = createSimulatorDataSource({
  identity: { id: "sim-main", type: "simulator" },
  scheduler,
  seed: 42,
  points: [
    {
      address: { sourceId: "sim-main", key: "temperature" },
      dataType: "number",
      initialValue: 50,
      generator: { type: "sine", minimum: 20, maximum: 80, periodMs: 10_000 },
      updateIntervalMs: 250
    }
  ]
});
```

Generators are `constant`, `sequence`, `toggle`, `counter`, `sine`,
`random-range`, `random-walk`, and `manual`. Random generators use isolated
seeded streams. Public configuration is declarative and JSON-safe; scheduler
and reconnect policy are runtime dependencies and must not be serialized.

Automatic points have one cancellable scheduled task each. They advance only
while connected and subscribed transports receive their normalized updates.
Disconnect and pause stop advancement; reconnect preserves the current value
and starts a new authoritative lifecycle generation. Missed ticks are not
replayed. A subscription receives its current value on a zero-delay scheduled
task by default. `samplingIntervalMs` limits forwarding, not generation.

Reads require a connection and support per-point failures. Writes are
conservative: only writable manual points are accepted by default;
`writePolicy: "writable-points"` enables explicitly writable automatic points.
Successful writes update state before synchronously dispatching the normalized
event. Browse exposes safe point metadata. `control` contains simulator-only
pause, reset, connection-loss, quality, and inspection operations.

The adapter uses the shared lifecycle controller and subscription manager.
Consumers must ingest its events through a runtime ingestion boundary; the
simulator never mutates runtime, bindings, renderer, or the document model.
