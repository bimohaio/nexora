# Animation Testing

Phase 10.03 adds metadata, primitive-registry, controller/lifecycle, binding, SVG DOM, Designer
preview and end-to-end runtime-to-renderer tests. The benchmark suite includes a deterministic
1,000-symbol/5,000-slot mass-disposal case; see the
[performance report](phase-10-03-performance-report.md).

Core animation tests use `ManualAnimationClock`, `ManualFrameScheduler`,
`TestMotionPreferenceSource`, `TestVisibilityProvider` and definition builders.
They advance time explicitly and never wait on wall-clock timers.

Test utilities are exported only from `@web-scada/animation-engine/testing`.
