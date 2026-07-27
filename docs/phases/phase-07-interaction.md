# Phase 07 — Interaction

## Goal

Provide a coherent, accessible interaction system for Designer and runtime views.

## Scope

Pointer and keyboard input, hit testing, focus, hover, selection gestures, pan and
zoom controllers, tool routing, and accessibility semantics.

## Deliverables

Interaction controller, input abstractions, keyboard map, focus model, accessible
metadata, and browser coverage.

## Public APIs

`@web-scada/interaction-engine` is the accepted renderer- and browser-independent
interaction API. Designer integration is provided by the selection, drag, keyboard,
and accessibility adapters exported by `@web-scada/designer-engine`. Renderer
integration remains behind typed adapter contracts; host DOM events are normalized
at the application boundary.

## Dependencies

Phase 04 Designer, Phase 05 editing tools, Renderer metadata events, and viewport
math.

## Testing

Pure gesture state machines, delegated metadata, keyboard navigation, pointer
capture, resize, focus restoration, and cross-input browser tests.

## Definition of Done

Core workflows are operable by pointer and keyboard with deterministic cleanup and
no per-primitive listener proliferation.

## Exit Criteria

Accessibility review and supported-browser interaction suites pass.

See also:

- [Viewport model](../architecture/viewport-model.md)
- [Renderer lifecycle](../architecture/renderer-lifecycle.md)
- [Phase 04 Designer](phase-04-designer.md)
