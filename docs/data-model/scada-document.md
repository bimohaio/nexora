# SCADA document

`ScadaDocument` is the versioned JSON-safe aggregate rooted at schema `1.0.0`. It contains identity and metadata, logical canvas settings, ordered layers, nodes, port-referenced connections, variables, bindings, and runtime configuration. Runtime measurements are excluded.

Unknown input follows: structural validation → migration → semantic validation → default normalization. Phase 0 defines this contract and validates the top-level/version shape; comprehensive parsing follows later.
