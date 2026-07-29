# Extensible symbol architecture

The generic `@web-scada/symbols` package owns serializable definitions, categories, packs, aliases,
ports, property metadata, capabilities and registry validation. It has no SVG, DOM, framework,
runtime protocol or application dependency.

`@web-scada/renderer-svg` owns SVG renderers and its independent visual registry. The renderer asks
the generic registry to canonicalize a node type and then performs an O(1) visual lookup. Missing
metadata or visuals use the existing bounded placeholder.

Applications are composition roots. They may use `createDefaultSymbolEnvironment()` or construct
isolated registries and register only selected generic and SVG packs. There is no mutable global
registry.

Persisted documents keep their original `symbolType`, flat property names and port IDs. Alias
lookup is non-destructive: it does not rewrite serialization. Runtime state remains transient and
is merged only into resolved renderer context.
