# Runtime Engine

Phase 6 establishes the renderer-neutral runtime for transient SCADA values.
The certified canonical flow is:

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
 RuntimeVisualSnapshot + diff
                 |
                 v
   RuntimeRenderPipeline
                 |
                 v
       incremental renderer
```

Runtime Engine owns normalized values, revisions, snapshots, subscriptions,
quality, scheduling, provider orchestration, and diagnostics. It does not own
protocol transports, DOM, design-document mutation, expressions, alarms,
historian data, or animation loops.

## Documents

- [Value and quality model](runtime-value-model.md)
- [Engine ownership and integration](runtime-engine.md)
- [Runtime store](runtime-store.md)
- [Immutable snapshots](runtime-snapshots.md)
- [Production-style demo](runtime-demo.md)
- [Snapshots and change sets](runtime-snapshot-and-change-set.md)
- [Lifecycle and scheduling](runtime-lifecycle.md)
- [Renderer and simulator boundaries](runtime-integration.md)
- [Deterministic runtime simulator](runtime-simulator.md)
- [Public contract inventory](runtime-contract-inventory.md)
- [Phase 6.00 audit](phase-6-00-audit.md)
- [Phase 6.02 audit](phase-6-02-audit.md)
- [Phase 6.02 technical debt](phase-6-02-known-risks.md)
- [Known risks](phase-6-00-known-risks.md)
- [Errors and diagnostics](runtime-errors.md)
- [Performance and benchmarks](runtime-performance.md)
- [Final audit report](runtime-audit-report.md)
- [Phase 7 readiness](runtime-readiness.md)

See also [Runtime Engine API](../api/runtime-api.md) and
[ADR 0021](../adr/0021-use-normalized-runtime-snapshots.md).
