# ADR 0030: Core animation primitives and execution boundary

- Status: Accepted
- Date: 2026-07-29

## Context

Phase 10_00 established renderer-neutral intent contracts and Phase 10_01 established the shared
scheduler. Phase 10_02 needs executable primitives without introducing private clocks,
renderer-specific types, document mutation, or competing registries.

## Decision

`@web-scada/animation-engine` owns primitive contracts, pure value interpolation, local timelines,
primitive registration/factories, transient instances, scheduler adapters, composites, event
dispatch, and optional pooling. Existing Phase 10 contracts and scheduler APIs remain compatible.

Configuration is cloned/frozen at construction. Runtime state stays instance-local and is never
serialized into `ScadaDocument`. Timeline time derives from injected scheduler-owned clocks/frame
contexts. Primitive functions do not request frames. One adapter attaches one instance to exactly
one shared scheduler task and emits renderer-neutral invalidations.

Values use canonical RGBA, neutral vectors/matrices, and decomposed transforms. sRGB channel
interpolation is the current color policy. Exact 180-degree shortest-angle ties resolve clockwise.
Public easing/interpolation extension points are instance-scoped; built-ins cannot be overwritten.

The primitive registry owns stable canonical IDs, aliases, metadata, compatibility information,
and factories. Factory construction validates atomically and never starts playback. Composite and
event infrastructure coordinate existing instances but do not interpolate or schedule.

Reduced-motion and visibility signals remain scheduler/runtime policy inputs. Core primitives
expose compatible boundaries and do not subscribe to browser policy sources per instance.

## Alternatives

- CSS/SVG animations were rejected because they break renderer neutrality and deterministic manual
  time.
- Per-instance RAF/timers were rejected because they bypass the shared scheduler.
- Replacing Phase 10_00 contracts was rejected because compatible public consumers already exist.
- Global mutable registries were rejected because tests, viewers, plugins, and workers require
  isolation.
- Mandatory pooling in every hot path was rejected because the master performance policy requires
  evidence before micro-optimization.

## Consequences

Runtime owners must create and dispose registries, factories, schedulers, adapters, and instances.
Renderers privately serialize abstract values and preserve element identity. Future keyframe,
physics, plugin, worker, or GPU implementations can extend capabilities without changing the
clock/ownership boundary.

No persisted schema changes are introduced, so no migration is required. Existing definition IDs,
target properties, scheduler contracts, and serialized documents remain compatible.
