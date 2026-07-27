# Phase 6 compatibility with Phase 5

| Capability                | Existing API                      | Status               | Reuse strategy                                                                      |
| ------------------------- | --------------------------------- | -------------------- | ----------------------------------------------------------------------------------- |
| Persisted bindings        | `PropertyBinding`                 | AS_IMPLEMENTED       | Resolve existing declarations without schema changes.                               |
| Runtime configuration     | `RuntimeSettings`                 | AS_IMPLEMENTED       | Use refresh, stale, and default-quality settings.                                   |
| Runtime renderer state    | `RuntimeVisualStateReader`        | HARDENING_REQUIRED   | Preserve `getNodeState`; add optional property, visibility, and connection readers. |
| Targeted node refresh     | `refreshRuntimeStates`            | COMPATIBLE_VARIATION | Preserve first argument; add optional connection IDs.                               |
| Runtime demo              | manual `Map<nodeId, SymbolState>` | HARDENING_REQUIRED   | Replace application-owned state with Runtime Engine and simulated provider.         |
| Design/runtime separation | ADR 0006                          | AS_IMPLEMENTED       | No persisted schema or mutation changes.                                            |
| Incremental SVG identity  | renderer entity maps              | AS_IMPLEMENTED       | Re-render only affected existing elements.                                          |

No architectural blocker or persisted migration was required.
