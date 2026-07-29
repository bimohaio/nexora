# Animation Testing

Core animation tests use `ManualAnimationClock`, `ManualFrameScheduler`,
`TestMotionPreferenceSource`, `TestVisibilityProvider` and definition builders.
They advance time explicitly and never wait on wall-clock timers.

Test utilities are exported only from `@web-scada/animation-engine/testing`.
