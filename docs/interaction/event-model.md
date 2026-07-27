# Interaction event model

`InteractionEvent` normalizes pointer, keyboard, focus, wheel, click, context-menu,
and resize event names without retaining a host event. Custom string event types
remain possible for future phases.

Events carry a monotonic timestamp supplied by the adapter, an interaction target,
optional normalized pointer/data, modifiers, and propagation flags. The dispatcher
sets `phase` and `currentTarget`. `preventDefault`, `stopPropagation`, and
`stopImmediatePropagation` affect engine dispatch only; adapters decide how those
results map to a host.

Pointer positions name their coordinate space. Pressure and tilt are numeric, and
pointer type is `mouse`, `pen`, `touch`, or `unknown`.
