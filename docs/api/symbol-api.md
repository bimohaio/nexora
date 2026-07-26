# Symbol API

Status: implemented in `@web-scada/symbols`.

## Metadata contracts

`SymbolDefinition` contains a canonical `type`, localization keys, category,
default/minimum dimensions, normalized ports, editable and bindable properties,
supported states, optional runtime capabilities, aliases, deprecation metadata,
and JSON-safe extension metadata. Runtime declarations never store observed
values.

## Registry

The compatible `SymbolRegistry` exposes registration, lookup, category filtering,
and clearing. `AliasAwareSymbolRegistry` adds `getCanonicalType`, `getAliases`,
and `isAlias` without breaking existing registry implementations.
`InMemorySymbolRegistry` implements the extended interface and validates
dimensions, ports, states, aliases, and capability consistency.

## Catalog

`INDUSTRIAL_SYMBOL_TYPES` provides stable canonical identifiers.
`INDUSTRIAL_SYMBOLS` contains 37 Phase 3 definitions. `ALL_SYMBOLS` combines them
with compatible Phase 1 definitions. `createIndustrialSymbolRegistry()` creates
the complete registry; `createExampleSymbolRegistry()` remains compatible and
returns that complete catalog.

See also:

- [Symbol architecture](../architecture/symbol-architecture.md)
- [Symbol definition](../data-model/symbol-definition.md)
- [Custom symbol extension](../architecture/custom-symbol-extension.md)
