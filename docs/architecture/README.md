# Architecture

This folder explains implemented subsystem boundaries, lifecycle, state flow,
rendering, validation, and versioning. Project-wide policy belongs in
`master-spec/`; durable decision rationale belongs in `adr/`.

Use [system overview](system-overview.md) and
[module dependencies](module-dependencies.md) as entry points. Renderer readers
should continue with [rendering architecture](rendering-architecture.md).
Designer readers should start with
[designer architecture](designer-architecture.md), then follow its tool,
selection, command, and overlay lifecycle links.
Phase 5 precision editing is documented in
[Advanced Editing Engine](advanced-editing-engine.md).
Runtime orchestration is documented in
[Runtime Engine](runtime-engine.md).
Detailed Phase 6 value and lifecycle contracts are indexed in
[Runtime documentation](../runtime/README.md).

See also:

- [Master architecture](../master-spec/architecture.md)
- [Data model](../data-model/README.md)
- [ADRs](../adr/README.md)
