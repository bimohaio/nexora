# SVG rendering architecture

`@web-scada/renderer-svg` consumes readonly `ScadaDocument` snapshots and never owns or mutates application state. `NativeSvgRenderer` translates document entities directly to SVG DOM, while pure modules calculate transforms, routes, grids, fit-to-view, zoom, and normalized changes.

Symbol metadata remains in `@web-scada/symbols`. SVG-specific `SvgSymbolRenderer` adapters live in the renderer package and are resolved by symbol type; the main renderer contains no symbol-type branches.

Layer strategy A is used: every ordered layer owns connection, node, and port groups. This gives deterministic layer z-order and guarantees connections render below nodes and ports within each layer.

Full rendering uses fragments/groups and rebuilds renderer-owned entities. Incremental rendering uses stable maps, creates/removes only named entities, preserves unrelated elements, and refreshes connections whose endpoint nodes changed. Scheduled changes coalesce into one `requestAnimationFrame`; synchronous `renderChanges` remains available for deterministic tests.
