# Migration guide

Existing consumers require no migration. New consumers may replace manually repeated registration
with `registerSymbolPack` and use `list`, `listByCategory`, `search`, `resolveType` and `validate`.
Applications wanting the full compatible environment should call
`createIndustrialSymbolEnvironment`. `createDefaultSymbolEnvironment` remains as a deprecated
compatibility alias.
Do not rewrite persisted aliases to canonical IDs unless an explicit document migration is added.
