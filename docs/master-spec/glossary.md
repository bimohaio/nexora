# Glossary

- **SCADA Core** — platform-neutral document, validation, mutation, event, and
  serialization contracts.
- **Renderer** — readonly visual projection of a validated SCADA document and
  resolved visual state.
- **Designer Engine** — selection, viewport, command, and editing orchestration.
- **Runtime Engine** — ephemeral values, quality, provider, and runtime execution
  contracts.
- **Binding Engine** — future evaluation layer mapping runtime values to resolved
  visual or target state.
- **Plugin SDK** — future extension contracts and capability boundaries.
- **Design state** — persistable project intent stored in `ScadaDocument`.
- **Runtime state** — ephemeral observed or evaluated state not persisted into
  design properties.

See also:

- [Master architecture](architecture.md)
- [State separation](../architecture/state-separation.md)
- [Data-model index](../data-model/README.md)
