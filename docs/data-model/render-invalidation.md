# Render invalidation

`renderChanges(document, changes)` consumes the Phase 1 `DocumentChangeSet`. The
renderer derives invalidation privately:

- Changed nodes update their local visual and ports.
- Connections attached to changed or removed nodes are refreshed.
- Removed nodes clear node, port, and debug elements.
- Removed connections clear visual and hit paths.
- Layer changes update visibility, lock metadata, order, and entity placement.
- Removed layers clear their descendant element-map entries.
- Canvas changes rebuild the instance-owned grid definition and background/grid.

After an incremental update, layer-local entity order is reconciled with document
order by moving existing DOM objects. Unaffected nodes, connections, layers, and
definitions retain object identity. Viewport state is updated independently through
`setViewport`.

See also:

- [Data-model index](README.md)
- [Master architecture](../master-spec/architecture.md)
- [Conventions](../conventions/README.md)
