# Adding custom symbols

1. Define a unique canonical type following the symbol naming convention.
2. Create a `SymbolDefinition` with positive default/minimum dimensions,
   deterministic normalized ports, editable properties, supported states,
   capabilities, and aliases.
3. Register metadata in a `SymbolRegistry`.
4. If SVG output is required, implement `SvgSymbolRenderer.create()` and
   `update()` in node-local coordinates. Implement `dispose()` when the visual
   owns resources.
5. Register the visual under the canonical type in
   `SvgSymbolRendererRegistry`.
6. Test metadata validation, aliases, local coordinates, updates, disposal,
   fallback, and document validation.

Custom metadata must not import DOM types, protocol clients, tag stores, or
application state. Visual implementations must use safe SVG construction and
`textContent`.

See also:

- [Symbol API](../api/symbol-api.md)
- [Symbol naming](../conventions/symbol-naming.md)
- [Symbol architecture](symbol-architecture.md)
