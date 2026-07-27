# Phase 06 — Runtime

## Goal

Implement Runtime Engine orchestration for ephemeral values and resolved visual
state.

## Scope

Tag-store lifecycle, provider coordination, quality and freshness, runtime
scheduling, resolved state delivery, and viewer integration.

## Deliverables

Runtime Engine implementation, provider-neutral orchestration, diagnostics, and
runtime demo integration.

## Implemented subsystems

- timestamp-aware `InMemoryTagStore`;
- canonical JSON-safe runtime values, monotonic revisions, immutable snapshots,
  and runtime-specific change sets;
- atomic batch ingestion, stateful subscriptions, and disposable schedulers;
- `ProviderRuntimeEngine` lifecycle and `createRuntimeEngine`;
- provider subscription and status coordination;
- bounded exponential reconnect scheduling;
- refresh batching and stale-value scheduling;
- quality transitions and offline propagation;
- resolved node and connection visual state;
- targeted SVG renderer refresh;
- diagnostics, snapshots, runtime demo, and disposal.

## Public APIs

The reviewed contracts are listed in [Runtime Engine API](../api/runtime-api.md).

## Dependencies

SCADA Core runtime settings, Renderer runtime-state reader, and future Binding
Engine boundary planning.

## Testing

Store subscriptions, quality transitions, lifecycle cleanup, scheduling,
reconnection simulations, and targeted visual updates.

## Definition of Done

Runtime values remain outside design properties and affected visuals update
without full document mutation.

## Exit Criteria

Lifecycle, state separation, diagnostics, and integration tests pass.

## Deferred boundaries

Expression evaluation remains Phase 8. MQTT, OPC UA, Modbus, BACnet, and remote
provider configuration remain Phase 9. Alarms, historian behavior, and animation
remain later-phase work.

See also:

- [Runtime Engine API](../api/runtime-api.md)
- [Runtime settings](../data-model/runtime-settings.md)
- [State separation](../architecture/state-separation.md)
- [Phase 6 audit](../audits/phase-6-audit.md)
- [Phase 6.00 detailed audit](../runtime/phase-6-00-audit.md)
