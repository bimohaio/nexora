# Symbol architecture

Phase 3 preserves two independent registries:

```text
SymbolRegistry (metadata)
        ↓ canonical type / aliases
SvgSymbolRendererRegistry (visual adapter)
        ↓ create / update / optional dispose
Renderer-owned local SVG group
```

`@web-scada/symbols` owns only renderer-neutral metadata. It may depend on SCADA
Core port contracts and pure geometry validation, but never DOM or SVG types.
`@web-scada/renderer-svg` owns SVG construction and lifecycle. The Renderer first
resolves metadata, then uses the canonical type to resolve the visual.

Unknown metadata, metadata without a visual, and aliases whose canonical visual is
unavailable use the safe fallback. Visuals draw from local `(0, 0)` through node
width and height; the outer Renderer group owns translation, center-based
rotation, and scale.

See also:

- [Symbol API](../api/symbol-api.md)
- [Symbol rendering](../data-model/symbol-rendering.md)
- [ADR 0020](../adr/0020-use-metadata-driven-symbol-renderers.md)
