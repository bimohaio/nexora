# Phase 10 — Animation

Phase 10 is implemented through Phase 10.10. Symbol metadata flows through runtime controllers,
core primitives, one shared scheduler, transient alarm/animation composition and incremental SVG
rendering. Designer preview and the browser demo use the same production runtime path. See the
[symbol integration guide](../animation/symbol-integration.md), the
[runtime visual pipeline](../runtime/phase-10-09-visual-pipeline.md), and the
[final audit](../audits/phase-10-final-audit.md).

## Goal

Provide deterministic visual animation driven by resolved runtime state.

## Scope

Animation descriptors, interpolation, scheduling, reduced motion, lifecycle,
targeted updates, and SVG visual integration.

## Deliverables

Animation engine or adapter boundary, built-in transitions, accessibility policy,
and performance diagnostics.

## Public APIs

`@web-scada/animation-engine`, `@web-scada/alarm-visualization`, and the additive Runtime,
Binding, Designer, Symbols, and SVG adapter exports are the accepted Phase 10 APIs. Generic
contracts remain renderer-neutral and operate on resolved visual state. Persisted document
compatibility is unchanged.

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

## Deferred boundaries

- Alarm shelving state and presentation are supported. Automatic expiration and operator workflow
  require a future product workflow; Phase 10 does not introduce a timer.
- SVG/image export belongs to Phase 12. Phase 10 does not create a visual-export API ahead of its
  format and security decisions.

See also:

- [Rendering architecture](../architecture/rendering-architecture.md)
- [State separation](../architecture/state-separation.md)
- [Performance policy](../master-spec/performance.md)
