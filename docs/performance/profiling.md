# Interaction Profiling

`InteractionProfiler` records bounded immutable spans with duration and scalar metadata.
`InteractionPerformanceMetrics` tracks:

- event latency and dispatch duration;
- scheduler and frame duration;
- cache hit ratio;
- allocations and queue high-water mark;
- interaction FPS and dropped frames.

`PerformanceDiagnosticsController` publishes snapshots to an optional developer dashboard adapter.
All profiling can remain disabled in production paths.
