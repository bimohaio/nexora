# Symbol definition

Symbols are metadata-driven: stable canonical type, localization and description
keys, extensible category, default/minimum size, normalized ports,
editable/bindable property metadata, supported states, runtime capabilities,
aliases, optional deprecation metadata, and extensions. `InMemorySymbolRegistry`
validates dimensions, ports, states, capabilities, and aliases; it rejects
collisions unless canonical replacement is explicit and returns snapshot
collections.

Phase 3 provides 37 industrial definitions while preserving compatible Phase 1
definitions. Generic definitions contain no renderer or DOM contracts.

See also:

- [Data-model index](README.md)
- [Master architecture](../master-spec/architecture.md)
- [Conventions](../conventions/README.md)
- [Symbol API](../api/symbol-api.md)
- [Symbol runtime state](symbol-runtime-state.md)
