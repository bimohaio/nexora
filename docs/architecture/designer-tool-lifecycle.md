# Designer Tool Lifecycle

Tools implement pointer down/move/up, keyboard, cancellation, and cleanup
hooks. `InMemoryToolRegistry` provides registration and lookup while
`DesignerToolController` guarantees the old tool is cancelled and cleaned
before activating the next one.

The MVP supplies Select, Pan, Rectangle, and Connection tools. Applications may
register another `DesignerTool` without changing the engine. Escape cancels the
active transient interaction; disposal performs final cleanup.

See also:

- [Designer architecture](designer-architecture.md)
- [Selection lifecycle](designer-selection-lifecycle.md)
- [Designer API](../api/designer-api.md)
