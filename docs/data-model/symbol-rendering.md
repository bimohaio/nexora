# Symbol rendering

Generic `SymbolDefinition` remains DOM-free. Renderer-local
`SvgSymbolRenderer` has `create`, `update`, and optional `dispose` methods
receiving a readonly document, node, dimensions through its transform, and
precomputed runtime visual state.

The default SVG adapter registry contains the compatible initial visuals and all
37 Phase 3 industrial visuals. Alias nodes resolve metadata first and use the
canonical type for visual lookup. Properties use safe defaults for appearance,
labels, level, instrument codes, and state color. Unsupported types use an
inspectable dashed fallback.

See also:

- [Data-model index](README.md)
- [Master architecture](../master-spec/architecture.md)
- [Conventions](../conventions/README.md)
