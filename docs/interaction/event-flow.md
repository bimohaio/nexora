# Interaction event flow

```text
Browser or host input
  -> adapter normalization
  -> pointer / keyboard engine
  -> hit testing / focus navigation
  -> selection / drag session
  -> Designer command
  -> immutable document state
  -> renderer update
  -> SVG and accessibility projection
```

The interaction dispatcher invokes an active session before registered listeners.
Listener traversal is capture, target, then bubble. Within a phase, higher priority
runs first and registration order breaks ties. `preventDefault` reports cancellation;
propagation cancellation stops later phases, while immediate cancellation stops
remaining listeners. Queues preserve insertion order, batch explicitly, and discard
cancelled work. Pointer moves may be coalesced before dispatch, but terminal events
are never coalesced.
