# Design and runtime state separation

Design state is persisted in `ScadaDocument`: geometry, symbol properties, layers, connections, variables, and binding declarations.

Runtime state is ephemeral: tag values, quality, timestamps, alarms, animation, and communication state. It is held behind runtime-engine interfaces and must not be copied into node properties. Bindings bridge runtime values to presentation without changing the stored design document.

See also:

- [Architecture index](README.md)
- [Master architecture](../master-spec/architecture.md)
- [Data model](../data-model/README.md)
