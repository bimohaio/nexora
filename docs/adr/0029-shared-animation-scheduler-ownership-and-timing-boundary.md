# ADR 0029: Shared Animation Scheduler Ownership and Timing Boundary

## Status

Accepted

## Context

Phase 10 needs deterministic animation timing without symbol-local timers, renderer
coupling, or persisted runtime state. The runtime dispatcher and SVG renderer already
have compatible one-shot coalescing utilities, but neither owns animation task
lifecycle, reduced-motion policy, visibility policy, or animation invalidations.

## Decision

`@web-scada/animation-engine` owns the public `AnimationScheduler` contract and
`SharedAnimationScheduler` implementation. Each runtime/viewer creates its own
instance; there is no process singleton.

- The scheduler owns task entries, one pending frame handle, mutation ordering,
  normalized frame time, transient elapsed time, diagnostics, and invalidation
  aggregation.
- Callers own immutable task descriptors. Handles expose only task-local lifecycle
  capabilities.
- `AnimationTimeSource` and `AnimationFrameDriver` own host time and scheduling.
  Browser access is isolated in lazy adapters; deterministic tests use manual
  implementations.
- The owning runtime/viewer supplies reduced-motion and visibility changes and owns
  adapter subscriptions.
- An injected renderer-neutral sink receives zero or one immutable invalidation batch
  per dispatched frame. Renderer mapping and rendering remain downstream concerns.
- Scheduler disposal cancels its pending driver callback, disposes registrations once,
  clears queues, and releases sink/logger references.

Tasks registered during dispatch start on the next frame. Cancellation is visible
immediately to tasks that have not run. Scheduler disposal requested by a callback
stops the remainder of that frame and suppresses its batch commit.

## Alternatives

Using the SVG renderer's existing RAF queue would make the animation package depend on
one renderer. Replacing the runtime scheduler would conflate runtime data batching
with continuous animation. A global scheduler singleton would break independent
viewer disposal and deterministic test isolation. Per-symbol RAF, interval, or CSS
loops do not provide shared lifecycle or invalidation batching.

## Consequences

Animation work is deterministic, renderer-neutral, Node-importable, and bounded by
one pending frame request per scheduler. Hidden/unmounted contexts stop continuous
driving and reset their delta baseline. Reduced-motion-disabled tasks remain
registered without driving empty frames and resume when policy changes.

The browser policy sources are intentionally not owned automatically by the core
scheduler. The runtime/viewer that subscribes them must unsubscribe and dispose them.
Offscreen targets currently continue on the shared cadence; target-level throttling
is deferred until the owning runtime has an authoritative target visibility map.

## Compatibility impact

The change is additive. Existing `AnimationClock`, `AnimationFrameScheduler`,
`RuntimeFrameScheduler`, renderer scheduling, symbol IDs, property names, and
serialized documents are unchanged.

## Migration

Future runtime/viewer integration creates one scheduler instance, translates runtime
animation state into tasks, feeds policy changes, and maps invalidation IDs through
renderer-private caches. Existing renderer/runtime frame queues remain
`FUTURE_MIGRATION` candidates only when an evidence-backed shared integration exists.

## References

- Web SCADA Engine Master Specification, Phase 10
- Phase 10.01 Shared Animation Scheduler implementation prompt
- ADR 0027: Use transient Phase 10 state and a shared scheduler boundary
