# Binding definitions

Bindings are JSON-safe `PropertyBinding` values persisted in `ScadaDocument.bindings`.
Core owns this representation, schema validation, normalization, and serialization.
`@web-scada/binding-engine` re-exports it as `BindingDefinition` and adds transient
evaluation contracts.

```json
{
  "id": "binding_pump_active",
  "source": {
    "type": "tag",
    "tagId": "plant.line1.pump.running"
  },
  "target": {
    "type": "node-state",
    "nodeId": "node_pump_01"
  },
  "mode": "one-way",
  "enabled": true,
  "fallback": false,
  "extensions": {
    "vendor.example": {
      "retained": true
    }
  }
}
```

Sources are `tag`, `variable`, `constant`, or inert `expression` text. Targets are the
controlled node property/state, connection property, visibility, and text variants.
CSS selectors, DOM references, callbacks, runtime snapshots, credentials, and functions
are not valid persisted values. Unknown source or target discriminators are rejected by
schema `1.0.0`; namespaced optional data belongs in `extensions`.

A Phase 8.01 direct binding is the compatible subset whose source is `tag`. Its `tagId` is
the stable Runtime Engine lookup key. Direct evaluation does not add persisted state or
change the schema. Fallback remains optional, explicit, JSON-safe, and target-validated.

Expression sources may persist `language: "scada-expression-v1"`. When omitted, version 1
is the documented default. Unsupported versions fail compilation rather than silently
changing semantics. Source text remains authoritative inert data; ASTs, compiled state,
function implementations, runtime values, and diagnostics are never serialized.

Round trips preserve IDs, sources, targets, fallback values, formatter/transformation
options, and extensions. Non-finite numbers, functions, cycles, and non-plain objects are
rejected by Core's JSON-safe structural validation.
