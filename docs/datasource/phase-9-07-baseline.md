# Phase 9.07 baseline

## As-built architecture

| Area              | Finding                                                                                                                                                   | Classification       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Shared contracts  | `@web-scada/datasource-core` owns `DataSourceAdapter`, events, errors, quality, timestamps, scheduling, lifecycle, reconnect, and subscription contracts. | AS_IMPLEMENTED       |
| Adapters          | Simulator, REST, WebSocket, MQTT, Modbus, and OPC UA packages implement the shared adapter contract.                                                      | AS_IMPLEMENTED       |
| Lifecycle         | Adapters use the datasource-core lifecycle controller. The manager delegates and does not duplicate reconnect behavior.                                   | AS_IMPLEMENTED       |
| Runtime ingestion | `createDataSourceRuntimeIngestion` consumes normalized `DataSourceEvent` values and maps them through `updateMany`.                                       | AS_IMPLEMENTED       |
| Runtime bridge    | The existing bridge owns one adapter. The manager's `eventSink` composes with the same ingestion API for multiple adapters.                               | COMPATIBLE_VARIATION |
| Logging           | Runtime has its own logger; datasource-core previously had no shared logger. The manager accepts a minimal structural logger.                             | COMPATIBLE_VARIATION |
| Scheduling        | `DataSourceScheduler` is the shared clock/scheduler contract. The initial manager uses an injected `now` function because it creates no timers.           | COMPATIBLE_VARIATION |
| Diagnostics       | Runtime diagnostics do not model datasource fleets. Manager diagnostics are transient and protocol-neutral.                                               | HARDENING_REQUIRED   |

The manager is placed in `packages/datasource-core/src/manager*.ts`; a separate package would add
dependency and release overhead without establishing a distinct boundary.

## Compatibility decisions

- Existing adapter identity, capability, status, event, error, quality, timestamp, and subscription types
  remain authoritative.
- Registration requires descriptor and adapter identity IDs to match.
- Successful registration transfers adapter lifecycle ownership to the manager.
- Deterministic public ordering is registration order; dependency-aware bulk startup is stable
  topological order.
- Lifecycle operations are serialized per datasource. Bulk operations are sequential and aggregate
  results, prioritizing determinism and dependency ordering.
- Adapters emit normalized values through subscription listeners, so `subscribeSource` is the
  central routing and ownership boundary.
- Runtime integration is dependency-injected through `eventSink`; datasource-core does not import
  runtime-engine.
- Reconnect recovery remains adapter-owned.
- Diagnostics are transient and never enter `ScadaDocument`.

## Deferred differences

- Automatic failover, logical aliases, and logical write routing are not implemented. Explicit
  physical datasource IDs remain mandatory.
- Configuration-plan transactions, background health timers, async event queues, percentile/rate
  metrics, and a diagnostics demo UI remain future hardening.
- Event delivery is synchronous and does not accumulate an internal queue; consequently manager
  backpressure buffering is not applicable to this implementation. Adapter subscription queues
  remain bounded by adapter request/policy.
- The adapter contract does not accept `AbortSignal` for connect/disconnect. Bulk cancellation is
  honored between adapter operations but cannot interrupt an in-flight adapter call.

No architectural blocker was found for the implemented scope.
