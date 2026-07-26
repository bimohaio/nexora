# Render change set

`RenderChangeSet` includes added, updated, and removed IDs for nodes, connections, layers, variables, and bindings, plus canvas, metadata, runtime settings, viewport, and symbol-registry flags.

Variable/binding changes do not trigger visuals until a future binding adapter supplies runtime visual states. Canvas changes refresh background and grid. A symbol-registry change intentionally performs a full rebuild.
