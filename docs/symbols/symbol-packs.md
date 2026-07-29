# Symbol packs

`SymbolPack` groups generic definitions without renderer code. Register one with
`registerSymbolPack(registry, pack)`. Built-in optional packs include process, instrumentation,
electrical and control; `standardIndustrialPack` is the convenience complete industrial pack.

SVG packs use the separate `SvgSymbolVisualPack` contract and `registerSvgSymbolVisualPack`.
Applications must register matching packs. `validateAgainst` reports missing and orphan visuals.
