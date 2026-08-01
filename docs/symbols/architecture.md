# Extensible symbol architecture

The generic `@web-scada/symbols` package owns serializable definitions, categories, packs, aliases,
ports, property metadata, capabilities and registry validation. It has no SVG, DOM, framework,
runtime protocol or application dependency.

`@web-scada/renderer-svg` owns SVG renderers and its independent visual registry. The renderer asks
the generic registry to canonicalize a node type and then performs an O(1) visual lookup. Missing
metadata or visuals use the existing bounded placeholder.

Applications are composition roots. Production Designer and Runtime applications use
`createIndustrialSymbolEnvironment()` so the catalog, categories and SVG visual implementations
come from one versioned source. The environment returns isolated registries, so applications do not
share mutable state, while every registry is populated from the same definitions and renderer
implementations. Applications needing tree-shaking may instead construct isolated registries and
register only selected generic and SVG packs. There is no mutable global registry.

Designer thumbnails, the Designer canvas and Runtime rendering must pass the environment's
`svgVisualRegistry` explicitly to the SVG renderer. Runtime state may change declared properties,
states and animations, but it does not select an alternative base visual. Replacing a built-in SVG
visual therefore affects both applications while preserving their different authoring and runtime
overlays.

Persisted documents keep their original `symbolType`, flat property names and port IDs. Alias
lookup is non-destructive: it does not rewrite serialization. Runtime state remains transient and
is merged only into resolved renderer context.
