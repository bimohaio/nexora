# @web-scada/animation-engine

Renderer-neutral animation infrastructure for Web SCADA. The package owns immutable animation
configuration and transient playback state; it never owns DOM/SVG objects, protocol clients,
application stores, or independent timing loops.

## Core flow

`Primitive Registry → Factory → Isolated Instance → Shared Scheduler → Abstract Result`

The runtime owns registry, factory, scheduler adapters, and instance disposal. A primitive owns
only evaluation behavior. An instance owns playback/timeline state. The shared scheduler owns the
clock and frame cadence. Renderers serialize final abstract values outside this package.

## Creating a primitive

Implement `AnimationPrimitive<T>`, register immutable metadata and a factory, then construct an
instance with `AnimationPrimitiveFactory`. Construction leaves the instance in `created`; a runtime
or `PrimitiveSchedulerAdapter` starts it.

```ts
const registry = new AnimationPrimitiveRegistry();
registry.register<number>({
  metadata: {
    id: asPrimitiveId("animation.opacity"),
    displayName: "Opacity",
    description: "Interpolates opacity.",
    version: "1.0.0",
    engineCompatibility: ">=0.0.0",
    supportedDirections: ["normal", "reverse"],
    supportedFillModes: ["none", "forwards", "backwards", "both"],
    supportedInterpolations: ["linear"]
  },
  factory: () => opacityPrimitive
});
```

Identifiers are stable API. Duplicate IDs/aliases fail immediately. Deprecated aliases resolve to
the canonical entry and increment diagnostics.

## Timeline and values

All time is milliseconds and derives from injected/shared time. Progress is based on elapsed time,
not frame count. `AnimationTimeline` supports delay, end delay, playback rate, direction, fill,
finite/infinite repeat, seek, pause/resume, reverse, reset, cancellation, and disposal.

The value helpers are pure and reject non-finite values. Core color is immutable RGBA in sRGB;
serialization and CSS parsing are intentionally outside the package. Transform output remains a
typed decomposed value in fixed translation/rotation/skew/scale order. No transform strings or
`DOMMatrix` enter core.

## Composite, events, and pooling

`AnimationComposite` coordinates primitive or nested composite instances in parallel, sequence,
stagger, delay-group, race, barrier, or conditional modes without scheduling frames or performing
interpolation. It supports finite/infinite loops, alternate direction, conditional children,
retry/backoff/fallback policies, cycle validation, and stable lifecycle/seek/reverse/speed
propagation. Retry delays advance only from owner-supplied shared scheduler time. The event
dispatcher uses stable priority and subscription order, isolates subscriber failures, and supports
queued delivery. `ObjectPool` is bounded and detects foreign or double releases; use it only after
profiling shows a benefit.

## Lifecycle and ownership

Disposed timelines, instances, composites, and dispatchers reject future operations. Scheduler
adapters dispose only their task/instance, never the caller-owned shared scheduler. Runtime
execution state must never be persisted into `ScadaDocument`.

Known limitations: Phase 10_02 does not implement symbol-specific blink/flow/motor behavior,
renderer serialization, designer UI, binding trigger evaluation, physics, paths, particles, or
alarm visualization.
