# Data Source Foundation Architecture

## Boundary

External protocols and simulators map their raw payloads into `@web-scada/datasource-core`.
Application integration then maps normalized point addresses and values into Runtime Engine input.
The Runtime Engine owns state, revisions, snapshots, scheduling, and dispatch. Binding Engine reads
runtime state; renderers read resolved visual state.

```text
adapter -> datasource-core contracts -> runtime integration -> Runtime Engine -> Binding -> Renderer
```

The foundation depends only on `@web-scada/core` for the authoritative `JsonValue`. It has no
runtime, renderer, designer, DOM, Node networking, state-management, or protocol dependency. The
existing Runtime Engine `DataProvider` remains compatible and unchanged; a later integration layer
can bridge it without moving runtime ownership into this package.

## Decisions

Capabilities describe what an implementation can do. Permissions independently describe what the
current instance may do, defaulting to deny. Operation methods remain structurally uniform and fail
deterministically rather than requiring function-presence discovery.

Point identity is the tuple of source, optional namespace, key, and optional path. Extensions do not
participate in equality. Length-prefixed canonical keys prevent delimiter collisions. Integrations
own the explicit mapping to a Runtime Engine tag key.

Events are readonly discriminated data objects, not browser events, EventEmitter values, or RxJS
streams. When sequence metadata exists, consumers can order and deduplicate within an adapter;
otherwise arrival order is authoritative. Adapter implementations own listener isolation.

Normalized outputs are copied and frozen to the depth traversed by normalization. Contracts are
readonly at compile time. Metadata and values use the Core package's JSON model and the stricter
runtime validator in datasource-core.

## Deferred

Phase 9.01 owns reconnect scheduling, repeated-call orchestration, subscription fan-out,
deduplication, and reference counting. Protocol packages own raw quality mapping, option
degradation, transport behavior, and client libraries. Browse contracts are deliberately minimal.
