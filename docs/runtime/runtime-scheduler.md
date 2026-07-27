# Runtime scheduler

`RuntimeFrameScheduler` implements `RuntimeTaskScheduler` with `requestAnimationFrame`. It maintains
at most one outstanding frame, drains all tasks captured for that frame in scheduling order, and
leaves reentrant tasks for the next frame. Individual returned tasks may be cancelled.

Inject a `RuntimeFrameDriver` for non-browser hosts and deterministic tests. Existing
`ImmediateRuntimeScheduler` and `ManualRuntimeScheduler` remain available for synchronous and
timer-based runtime-engine tests.

Disposing the scheduler cancels the outstanding frame and drops queued tasks. A disposed scheduler
cannot be reused.
