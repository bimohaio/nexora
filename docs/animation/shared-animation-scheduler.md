# Shared Animation Scheduler

`SharedAnimationScheduler` is the transient timing owner for Phase 10 animation. One
runtime or viewer owns one instance and injects a frame driver, time source, and
optional invalidation sink. It never mutates `ScadaDocument` and has no renderer,
framework, DOM, or data-source dependency.

## Lifecycle

With `autoStart: true` (the default), construction enters `running` but requests no
frame until an eligible task is registered. `pause()` and `stop()` cancel the pending
request and reset the time baseline. `resume()` or `start()` schedules at most one
request. `dispose()` permanently cancels driving, disposes each task once, clears
registrations/queues, and releases the sink and logger.

Task handles support idempotent pause, resume, cancel, and dispose. Completion,
failure, cancellation, and disposal are terminal. A descriptor registered during a
callback starts on the following frame. A task may cancel itself or another task
safely. Scheduler disposal during a callback stops later callbacks and suppresses the
current invalidation batch.

## Timing and ordering

Frame timestamps and deltas are milliseconds. The first dispatched frame and the
first frame after pause, stop, or visibility suppression use delta `0`. Negative or
non-finite time is normalized and diagnosed. Unscaled delta is clamped to `100 ms` by
default before applying the scheduler playback rate. Elapsed time accumulates scaled
delta only.

Tasks run by semantic priority (`accessibility`, `critical-alarm`, `alarm`, `runtime`,
`designer-preview`, `decorative`) and then registration sequence. The scheduler has
one pending driver request at most and stops driving when no eligible task remains.

## Policies

The owner calls `setReducedMotion()` and `setVisibility()` from its policy adapters.
Tasks marked `disable` are suppressed while reduced motion is active.
`static-final-state` tasks receive one reduced-motion frame and then policy-pause until
the preference returns to `no-preference`; `allow` and `reduce` continue to receive the
resolved signal in frame context.
`document-hidden` and `unmounted` stop frame driving while preserving registrations.
Returning visible resets the delta baseline. `offscreen` currently continues on the
shared cadence; a later target-aware integration may add shared throttling.

## Invalidation batching

Tasks return renderer-neutral target IDs. Duplicate `(targetType, targetId, reason)`
entries are removed in deterministic dispatch order. The injected sink receives at
most one readonly non-empty batch per frame. Sink failures are diagnosed and do not
stop later frames.

## Deterministic example

```ts
const clock = new ManualAnimationClock();
const driver = new ManualAnimationFrameDriver();
const scheduler = new SharedAnimationScheduler({
  timeSource: clock,
  frameDriver: driver,
  invalidationSink
});

const handle = scheduler.register({
  update: (frame) => ({
    status: frame.elapsedTime >= 1000 ? "complete" : "continue",
    invalidations: [{ targetType: "symbol", targetId: "pump-1" }]
  })
});

driver.fireFrame(0);
driver.fireFrame(16);
handle.dispose();
scheduler.dispose();
```
