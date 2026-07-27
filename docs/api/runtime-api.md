# Runtime Engine API

Status: implemented Phase 6 contracts in `@web-scada/runtime-engine`.

## Values and store

`RuntimeValue` contains `tagId`, value, data type, quality, and ISO timestamp.
It remains the compatible provider input. `RuntimeDataPointInput` is the
canonical untrusted ingestion shape; `RuntimeDataPoint` is the normalized,
JSON-safe, epoch-timestamp representation used in snapshots.

`InMemoryTagStore` implements `MutableTagStore`:

- `update` and atomic `updateMany`;
- `remove`, `clear`, `has`, and `getDataPoint`;
- monotonic `revision`;
- cached immutable `snapshot`;
- `subscribeChanges` returning `RuntimeSubscription`;
- idempotent `dispose`.

Canonical results are `RuntimeUpdateResult` or `RuntimeBatchResult` and include
diagnostics and an optional `RuntimeChangeSet`. Existing `get`, `getAll`, `set`,
`setMany`, `delete`, `markQuality`, and callback unsubscribe APIs remain
available.

## Provider

`DataProvider` owns `connect`, `disconnect`, and tag subscription. Providers may
also expose `subscribeStatus` so unexpected disconnects and errors enter the
reconnect lifecycle. Phase 6 is protocol-neutral.

## Engine

Create an engine with:

```ts
const runtime = createRuntimeEngine({
  document,
  provider,
  reconnect: {
    initialDelayMs: 500,
    maximumDelayMs: 30_000
  }
});
```

`RuntimeEngine` exposes:

- `start()`, `stop()`, and idempotent `dispose()`;
- `store` and renderer-neutral `visualState`;
- direct `update`, `updateMany`, `remove`, and `clear` ingestion;
- `getRuntimeSnapshot()` for raw immutable state;
- `getVisualSnapshot()` for resolved immutable renderer state;
- `flush()` for deterministic pending visual commits;
- `refreshFreshness()` for deterministic/manual checks;
- `getStatus()` and `getSnapshot()`;
- `subscribe()` for typed status, value, and diagnostic events.

Starting twice while connected is safe. Stopping unsubscribes provider streams,
cancels timers, disconnects the provider, and marks known subscribed values
offline. Disposal additionally removes internal listeners.

## Resolved state

`RuntimeVisualStateReader` exposes node state, property overrides, runtime
visibility, connection style overrides, and quality. These values are
ephemeral. The SVG renderer merges them only for render context and never
mutates `ScadaDocument`.

Direct tag, variable, and constant sources are resolved in Phase 6.
`PassthroughBindingEvaluator` returns the source value. A custom
`BindingEvaluator` may be injected. Expression parsing and general
transformations are deferred to Phase 8.

Every `values` event includes `visualCommit` with the previous snapshot,
committed snapshot, and `RuntimeVisualSnapshotDiff`. Visual revision `0` is the
initial resolved snapshot. Revisions are instance-local and increment once per
meaningful visual commit. The SVG renderer consumes this through
`renderRuntimeChanges(snapshot, diff)`.

## Scheduling and diagnostics

Updates are coalesced using `runtimeSettings.refreshInterval`. Freshness uses
`staleAfterMs`. Reconnection defaults to bounded exponential backoff.
`RuntimeScheduler` can be injected for deterministic tests.
`ImmediateRuntimeScheduler` and `ManualRuntimeScheduler` implement the generic
`RuntimeTaskScheduler` foundation; the manual variant also implements
`RuntimeScheduler` and supports cancellation, `flushOne`, `flushAll`, failure
isolation, and disposal.

Diagnostics cover connection failures, reconnect scheduling, invalid or
out-of-order values, stale values, unsupported sources, and binding failures.
Snapshot history is bounded by `diagnosticLimit`.

`engine.diagnostics` exposes aggregated sanitized issues, health, clearing, and
lightweight metrics. Logging is optional through `RuntimeLogger`; core code
never calls `console`. `RuntimeRecoveryPolicyResolver` provides deterministic
policy selection without changing diagnostic behavior.

`RuntimeBatchQueue`, `RuntimeUpdateQueue`, and `RuntimeDispatcher` provide keyed
batching and configurable coalescing. `RuntimeRenderPipeline` converts engine
visual commits into one incremental renderer delivery per scheduled frame.
`RuntimeMemoryAudit` and `RuntimeObjectPool` support bounded internal resource
management. Pooled mutable objects must never enter snapshots.

All exported contracts are renderer-neutral except
`RuntimeIncrementalRenderer`, which is a structural port containing no SVG or
DOM types.

## Simulator

`createRuntimeSimulator` creates a deterministic, renderer-neutral update
producer. It accepts any `RuntimeUpdateSink`, including `RuntimeEngine` and
`InMemoryTagStore`, and writes one atomic `updateMany` batch per tick.

```ts
const simulator = createRuntimeSimulator({
  sink: runtime,
  intervalMs: 250,
  seed: 42
});

simulator.tick(); // deterministic manual mode
simulator.start();
simulator.pause();
simulator.resume();
simulator.reset();
simulator.dispose();
```

`RuntimeSimulatorScenario` can replace the built-in industrial scenario.
Scenario input contains an injected timestamp, monotonic tick number, and one
seeded pseudo-random sample. The built-in scenario emits level, pump, valve,
pressure, temperature, and connection state plus deterministic quality
transitions.

See also:

- [Phase 06 Runtime](../phases/phase-06-runtime.md)
- [Runtime Engine architecture](../architecture/runtime-engine.md)
- [Detailed runtime documentation](../runtime/README.md)
- [State separation](../architecture/state-separation.md)
- [Runtime settings](../data-model/runtime-settings.md)
