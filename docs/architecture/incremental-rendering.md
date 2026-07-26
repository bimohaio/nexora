# Incremental rendering

The renderer maintains maps for layers, nodes, connections, connection hit areas, and `nodeId::portId` ports. `RenderChangeSet` extends the core change set with viewport and symbol-registry flags.

Added entities are created; updated entities retain their outer SVG element; removed entities and map entries are deleted. Updating a node recalculates its visual, ports, debug bounds, and every connected path. Layer order is restored by appending existing layer groups in document order.

`scheduleRenderChanges` merges repeated changes and keeps one animation frame pending. Removal wins over update in the core merge rules. `dispose` cancels the pending frame.
