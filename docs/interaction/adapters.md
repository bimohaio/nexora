# Adapters

`InteractionAdapter<TSourceEvent>` converts a host-specific input into an
`InteractionEvent`, connects to one dispatch sink, disconnects, and disposes.
`BaseInteractionAdapter` implements ownership and idempotent cleanup.

Adapters may target DOM, SVG, Canvas, WebGL, pointer, mouse, or touch sources, but
must contain normalization only. They must not perform selection, tool routing, or
editing. Raw source events must never be placed in normalized event data.

Unit tests can use an in-memory adapter; no browser environment is required.
