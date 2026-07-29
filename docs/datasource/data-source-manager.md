# Data Source Manager

`createDataSourceManager` coordinates multiple protocol-neutral `DataSourceAdapter` instances. It
owns registrations, lifecycle, normalized event routing, subscription cleanup, health assessment,
and sanitized diagnostics. It has no renderer, framework, persisted-document, or concrete adapter
dependency.

## Ownership and lifecycle

A successful `register` transfers adapter lifecycle ownership to the manager. `unregister`,
`replace`, and manager `dispose` unsubscribe manager-owned handles, disconnect when needed, and
dispose the adapter. Disposal is idempotent and attempts cleanup for every registered source.

Lifecycle calls for one source are serialized. `connectAll` starts dependencies before dependents
and aggregates individual failures. `disconnectAll` uses reverse dependency order. Disabled
sources are skipped during connect. The manager does not reproduce adapter reconnect policy.

Registration order is the deterministic order for `list`; filters support enabled state, adapter
type, group, and tag.

## Routing and Runtime Engine integration

Use `subscribeSource` to create an adapter subscription owned by the manager. Each normalized event
is sent to the optional `eventSink` and observers. Manager envelopes add source ID, replacement
generation, manager receive sequence, revision, and receive time. Delivery preserves each
adapter-listener call order but makes no global source-order claim. Observer and Runtime sink
failures are isolated and counted.

Pass `createDataSourceRuntimeIngestion(...).ingest` as the sink in application composition. Neither
datasource-core nor runtime-engine imports a concrete protocol package.

## Example

```ts
const manager = createDataSourceManager({
  eventSink: (event) => ingestion.ingest(event),
  logger
});

try {
  await manager.register({
    descriptor: {
      id: "simulator-main",
      adapterType: "simulator",
      enabled: true,
      group: "training"
    },
    adapter: simulator,
    healthPolicy: {
      enabled: true,
      staleAfterMs: 5_000,
      unhealthyAfterMs: 15_000
    }
  });

  const result = await manager.connectAll();
  const handle = await manager.subscribeSource("simulator-main", {
    addresses: [{ sourceId: "simulator-main", key: "temperature" }]
  });

  console.log(result.succeeded, manager.getDiagnostics().manager.aggregateHealth);
  await handle.unsubscribe();
} finally {
  await manager.dispose();
}
```

Replacement defaults to start-then-switch when the old source is connected: the new adapter must
connect successfully before routing ownership changes. Failure disposes the candidate and preserves
the old source. After the generation switch, old events are rejected and old resources are
released. Applications where parallel sessions are unsafe should disconnect or unregister first.

## Diagnostics and security

Snapshots are readonly copies and include lifecycle status, health, capabilities, generation,
subscription count, counters, last activity, and a bounded journal. Health is distinct from
connection state and uses per-source policy. A critical unhealthy source makes aggregate health
unhealthy.

Descriptors must contain only safe management metadata. Never place adapter configuration,
credentials, tokens, certificate material, or credential-bearing URLs in descriptors. Diagnostic
errors and logger context pass through recursive redaction, including nested keys, bearer values,
URI user info, arrays, and cycles. Raw process/write values are not journaled.

Current limitations are documented in
[phase-9-07-baseline.md](./phase-9-07-baseline.md). Run focused verification with:

```bash
pnpm --filter @web-scada/datasource-core typecheck
pnpm vitest run packages/datasource-core/src/manager.test.ts
```
