# Symbol authoring guide

To add a symbol:

1. Choose a stable canonical type ID and compatibility aliases.
2. Define DOM-independent metadata with `defineSymbol`.
3. Select a registered category and version.
4. Declare default/minimum size, flat persisted property metadata and stable normalized ports.
5. Declare generic and runtime capabilities; do not implement alarms or animation here.
6. Export the definition from an optional `SymbolPack`.
7. Implement `SvgSymbolRenderer` in `renderer-svg`.
8. Export the renderer from a matching `SvgSymbolVisualPack`.
9. Register both packs in an application composition root.
10. Test registry validation, aliases, defaults, visual creation, runtime updates and fallback.

Lamp uses `control.indicator.lamp` with aliases `lamp` and `industrial.lamp`; its active state is
supplied by normal runtime binding. Encoder uses `instrumentation.encoder.rotary` with alias
`encoder`; value, text and direction are declared capabilities only. Neither definition owns a
subscription, timer, SVG node, animation scheduler or alarm service.
