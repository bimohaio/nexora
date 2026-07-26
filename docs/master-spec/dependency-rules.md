# Dependency rules

Dependencies point from applications and higher-level engines toward stable,
lower-level contracts. SCADA Core cannot import the Renderer, DOM, transports, or
application state. Generic symbols cannot expose DOM types. The Renderer cannot
own parsing, migration, semantic validation, binding evaluation, or data-source
clients.

Cycles between workspace packages are prohibited. Imports should use package
public entry points unless implementation-local code is being tested.

See also:

- [Detailed dependency conventions](../conventions/dependency-rules.md)
- [Package boundaries](package-boundaries.md)
- [ADR 0002](../adr/0002-framework-independent-core.md)
