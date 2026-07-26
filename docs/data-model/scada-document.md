# SCADA document

`ScadaDocument` is the versioned JSON-safe aggregate rooted at schema `1.0.0`. It contains stable identity and metadata, logical canvas settings, ordered layers, nodes, port-referenced connections, variables, bindings, runtime configuration, and optional namespaced extensions. Runtime measurements are excluded.

Unknown input follows: structural validation → version inspection/migration → safe normalization → semantic validation. Documents contain no methods and all mutations return new values.
