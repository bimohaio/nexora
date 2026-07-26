# Phase 1 renderer boundary

The SVG renderer accepts an already parsed, migrated, normalized, structurally valid,
and semantically valid `ScadaDocument`. Those operations remain owned by
`@web-scada/core`; the renderer performs no JSON parsing, migration, normalization, or
domain validation.

Phase 2 directly reuses `ScadaDocument`, `ScadaNode`, `ScadaConnection`,
`ScadaLayer`, `DocumentChangeSet`, geometry transforms and port calculations,
`SymbolDefinition`, `SymbolRegistry`, and the runtime-state reader contract.
Renderer-specific contracts cover only SVG lifecycle, options, visual adapters,
events, and recoverable warnings.

Generic symbol metadata is DOM-independent. SVG visual adapters are resolved
separately in `@web-scada/renderer-svg`. Missing metadata emits
`symbol-metadata-missing`; missing SVG visuals emit `symbol-renderer-missing`. Either
condition is recoverable and uses the safe SVG fallback.

The runtime demo currently imports a typed in-memory fixture, not JSON. Any future
JSON import control must call the core import pipeline before `renderDocument`.

See also:

- [Architecture index](README.md)
- [Master architecture](../master-spec/architecture.md)
- [Data model](../data-model/README.md)
