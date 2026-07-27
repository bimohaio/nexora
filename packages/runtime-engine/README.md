# @web-scada/runtime-engine

Provider-neutral runtime orchestration for ephemeral tag values and resolved
visual state. Runtime values never mutate or serialize into design-time node
properties.

## Capabilities

- immutable, timestamp-aware in-memory tag store;
- canonical JSON-safe data points with source and ingestion timestamps;
- monotonic revisions, immutable snapshots, and incremental change sets;
- atomic canonical batch ingestion and deterministic equality;
- stateful subscriptions, subscriber isolation, and reentrant-write protection;
- immediate/manual disposable task schedulers;
- provider connect, subscribe, disconnect, reconnect, and disposal lifecycle;
- deterministic exponential reconnect backoff;
- refresh-interval batching and targeted node/connection invalidation;
- quality, offline, and stale-value transitions;
- bounded typed diagnostics and runtime snapshots;
- direct tag, variable, and constant binding resolution;
- node state, node property, text, visibility, and connection style delivery;
- renderer-neutral visual-state reader;
- immutable resolved visual snapshots and revisioned diffs;
- scheduled/coalesced visual commits with explicit flush;
- deterministic sink-based industrial simulator with manual ticks and lifecycle control.
- centralized, sanitized diagnostic aggregation and injectable logging;
- health, recovery-policy, latency, cache, dispatch, and memory metrics;
- keyed update batching, configurable dispatch coalescing, and bounded temporary pooling.

```ts
const runtime = createRuntimeEngine({ document, provider });
const unsubscribe = runtime.subscribe((event) => {
  if (event.type === "values")
    renderer.renderRuntimeChanges(event.visualCommit.snapshot, event.visualCommit.diff);
});

await runtime.start();
// ...
unsubscribe();
await runtime.dispose();
```

For demos and tests that do not need a provider:

```ts
const simulator = createRuntimeSimulator({ sink: runtime, seed: 42 });
simulator.tick(); // one atomic batch and one runtime revision
simulator.start();
// ...
simulator.dispose();
```

Expression parsing, protocol adapters, alarms, historian behavior, and animation
remain owned by later phases.

The complete public API and ownership rules are documented in
`docs/api/runtime-api.md`. Phase 6 final conformance and readiness evidence is in
`docs/runtime/runtime-audit-report.md`.
