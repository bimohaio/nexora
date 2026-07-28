# ADR 0026: Simulator and runtime ingestion ownership

Status: accepted

The simulator implements `DataSourceAdapter` using the Phase 9.01 lifecycle
controller and subscription manager. Runtime Engine owns a generic normalized
event ingestion boundary and an optional adapter bridge. Mapping is explicit;
there is no implicit protocol-shaped runtime key.

This keeps adapter production, runtime state, binding evaluation, and rendering
in their established packages. Future MQTT, WebSocket, and industrial adapters
can reuse the bridge. The tradeoff is that applications must supply mappings
and a scheduler, but ownership, batching, cancellation, and tests remain
deterministic.
