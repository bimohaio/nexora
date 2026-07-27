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
- renderer-neutral visual-state reader.

```ts
const runtime = createRuntimeEngine({ document, provider });
const unsubscribe = runtime.subscribe((event) => {
  if (event.type === "values")
    renderer.refreshRuntimeStates(event.affected.nodeIds, event.affected.connectionIds);
});

await runtime.start();
// ...
unsubscribe();
await runtime.dispose();
```

Expression parsing, protocol adapters, alarms, historian behavior, and animation
remain owned by later phases.
