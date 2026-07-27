# Runtime Engine

Phase 6.00 establishes the renderer-neutral foundation for transient SCADA
values. The canonical flow is:

```text
Simulator / future Data Source Adapter
                 |
                 v
       RuntimeDataPointInput
                 |
                 v
          InMemoryTagStore
      +----------+-----------+
      |          |           |
  revision   snapshot    change set
      +----------+-----------+
                 |
                 v
     RuntimeVisualStateResolver
                 |
                 v
       targeted SVG refresh
```

Runtime Engine owns normalized values, revisions, snapshots, subscriptions,
quality, scheduling, provider orchestration, and diagnostics. It does not own
protocol transports, DOM, design-document mutation, expressions, alarms,
historian data, or animation loops.

## Documents

- [Value and quality model](runtime-value-model.md)
- [Snapshots and change sets](runtime-snapshot-and-change-set.md)
- [Lifecycle and scheduling](runtime-lifecycle.md)
- [Renderer and simulator boundaries](runtime-integration.md)
- [Public contract inventory](runtime-contract-inventory.md)
- [Phase 6.00 audit](phase-6-00-audit.md)
- [Known risks](phase-6-00-known-risks.md)

See also [Runtime Engine API](../api/runtime-api.md) and
[ADR 0021](../adr/0021-use-normalized-runtime-snapshots.md).
