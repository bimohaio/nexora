# @web-scada/designer-engine

Phase 4 document-editing orchestration for Nexora. The package provides
selection, pluggable tools, command history, clipboard operations, snapping,
resize constraints, viewport control, ordering, and transient overlay state.
Phase 5 adds rotation, parent-based groups, alignment/distribution,
multi-selection transforms, locking/visibility, layer reassignment, connection
waypoint editing, endpoint reassignment, deterministic snap ranking, keyboard
nudge, and cancelable interaction sessions.

Create an engine with `createDesignerEngine({ document, symbols, renderer })`.
Register Select, Pan, Rectangle, Connection, or application-defined tools with
`InMemoryToolRegistry`, then route input through `DesignerToolController`.

SCADA Core remains the durable document authority and Renderer remains a
rendering adapter. Continuous gestures update transient runtime state and
commit one final command on pointer up.

See [Designer Engine API](../../docs/api/designer-api.md) and
[Designer architecture](../../docs/architecture/designer-architecture.md).
