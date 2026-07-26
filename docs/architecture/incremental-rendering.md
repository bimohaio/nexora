# Incremental rendering

The renderer maintains maps for layers, nodes, connections, connection hit areas, and
`nodeId::portId` ports. `renderChanges` consumes the core `DocumentChangeSet` without
extending it. Viewport changes use `setViewport`; replacing a symbol visual registry
requires an explicit full render.

Added entities are created; updated entities retain their outer SVG element; removed entities and map entries are deleted. Updating a node recalculates its visual, ports, debug bounds, and every connected path. Layer order is restored by appending existing layer groups in document order.

`scheduleRenderChanges` merges repeated changes and keeps one animation frame pending. Removal wins over update in the core merge rules. `dispose` cancels the pending frame.

See also:

- [Architecture index](README.md)
- [Master architecture](../master-spec/architecture.md)
- [Data model](../data-model/README.md)
