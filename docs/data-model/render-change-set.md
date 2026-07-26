# Render change set

The SVG renderer consumes the Phase 1 `DocumentChangeSet` directly. It includes added,
updated, and removed IDs for nodes, connections, layers, variables, and bindings, plus
canvas, metadata, and runtime-settings flags.

Viewport updates use `setViewport` and symbol visual registry replacement requires an
explicit full `renderDocument` call. Renderer-only flags are intentionally not added to
the persisted document change contract.

Variable/binding changes do not trigger visuals until a future binding adapter supplies runtime visual states. Canvas changes refresh background and grid. A symbol-registry change intentionally performs a full rebuild.

See also:

- [Data-model index](README.md)
- [Master architecture](../master-spec/architecture.md)
- [Conventions](../conventions/README.md)
