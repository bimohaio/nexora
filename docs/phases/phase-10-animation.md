# Phase 10 — Animation

## Goal

Provide deterministic visual animation driven by resolved runtime state.

## Scope

Animation descriptors, interpolation, scheduling, reduced motion, lifecycle,
targeted updates, and SVG visual integration.

## Deliverables

Animation engine or adapter boundary, built-in transitions, accessibility policy,
and performance diagnostics.

## Public APIs

TODO: no animation API exists. Contracts must operate on resolved visual state and
must not enter generic symbol metadata without an accepted ADR.

## Dependencies

Renderer, Runtime Engine, Binding Engine, symbol visual adapters, and interaction
accessibility settings.

## Testing

Pure interpolation, deterministic clocks, cancellation, disposal, reduced-motion
behavior, state transitions, and browser rendering.

## Definition of Done

Animations are cancelable, bounded, accessible, and do not mutate design state or
rebuild unrelated SVG entities.

## Exit Criteria

Lifecycle, performance, reduced-motion, and browser conformance suites pass.

See also:

- [Rendering architecture](../architecture/rendering-architecture.md)
- [State separation](../architecture/state-separation.md)
- [Performance policy](../master-spec/performance.md)
