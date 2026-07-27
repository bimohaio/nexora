# Runtime Engine architecture

Phase 6 uses this flow:

```text
DataProvider
  -> ProviderRuntimeEngine lifecycle
  -> normalized RuntimeDataPoint
  -> InMemoryTagStore revision
  -> immutable snapshot + RuntimeChangeSet
  -> refresh-interval batch
  -> RuntimeVisualStateResolver
  -> affected node/connection IDs
  -> SVG renderer targeted refresh
```

## Ownership

`ScadaDocument` owns persisted binding declarations and runtime settings.
Runtime Engine owns current values, provider state, timers, quality,
diagnostics, and resolved visual overrides. Renderer owns DOM. No runtime value
is written back to a node, connection, binding, or serialized document.

## Lifecycle

The state model is:

```text
idle -> connecting -> running
                    -> reconnecting -> running
running -> stopped
any non-disposed state -> disposed
```

Provider subscriptions, provider-status subscriptions, reconnect timers,
freshness timers, batch timers, and engine listeners all have explicit cleanup.
`dispose()` is idempotent.

## Scheduling

Tag updates enter the store immediately but visual invalidation is coalesced by
`refreshInterval`. The resolver indexes tag bindings and emits deterministic,
sorted affected entity IDs. Unrelated SVG elements retain identity.

Canonical store batches commit atomically and synchronously as one revision.
Generic downstream task scheduling is available through immediate/manual
disposable schedulers. Raw snapshot subscribers and resolved visual subscribers
remain separate.

## Quality and freshness

Known values become `offline` when a provider disconnects or the engine stops.
Good or unknown samples older than `staleAfterMs` become `uncertain`. A newer
provider sample restores its supplied quality. Samples older than the current
tag timestamp are ignored.

## Binding boundary

Phase 6 resolves direct tag, variable, and constant sources to existing target
types. Expression sources are diagnosed and deferred to Phase 8. The evaluator
interface remains injectable, so Phase 8 can extend behavior without replacing
provider or store orchestration.

## Package boundary

Runtime Engine depends on Core contracts and symbol-state types. It has no DOM
or SVG dependency. Renderer integration is structural through the
renderer-owned `RuntimeVisualStateReader` contract.

Detailed value, snapshot, change-set, lifecycle, simulator, and risk
documentation is indexed at [Runtime Engine](../runtime/README.md).
