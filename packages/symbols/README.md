# @web-scada/symbols

Framework-neutral symbol/state/property/port metadata with a validating in-memory
registry. Registration is deterministic, duplicates are rejected unless
replacement is explicit, and returned collections are snapshots.

The package exports the compatible Phase 1 definitions, 37 Phase 3 industrial
definitions, stable type constants, alias and runtime-capability contracts, and
complete registry factories. `createExampleSymbolRegistry()` remains compatible
and now returns the full catalog.

Aliases resolve to canonical definitions through `get()`, `has()`, and
`getCanonicalType()`. SVG adapters remain in `@web-scada/renderer-svg`; this
generic package contains no DOM or protocol code.

See also:

- [Symbol API](../../docs/api/symbol-api.md)
- [Symbol architecture](../../docs/architecture/symbol-architecture.md)
- [Custom symbols](../../docs/architecture/custom-symbol-extension.md)
