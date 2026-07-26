# Module dependencies

```text
web-components
  ├─> designer-engine ─┐
  └─> runtime-engine  ─┴─> renderer-svg ─> core
                               │           geometry
                               └─────────> symbols ─> core

geometry ─> shared (only when justified)
```

Core has no internal package dependencies. Runtime and designer engines cannot depend on each other. Renderer inputs are readonly and renderer code cannot mutate documents. UI contains no domain logic. These constraints are duplicated in package manifests and root ESLint import restrictions.

See also:

- [Architecture index](README.md)
- [Master architecture](../master-spec/architecture.md)
- [Data model](../data-model/README.md)
