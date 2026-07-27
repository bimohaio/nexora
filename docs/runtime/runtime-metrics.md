# Runtime performance metrics

`RuntimeMetrics` records update and dispatch counts, failed updates, latency minimum/maximum/average,
resolve and dispatch duration, scheduler latency, frame duration, snapshot count, cache hit ratio,
memory usage, warnings, errors, and active subscriptions.

Mutations update primitive counters. Repeated `snapshot()` calls return the same cached immutable
object until a counter changes, minimizing diagnostic overhead. Memory values are supplied by the
host because core runtime code does not depend on browser-specific profiling APIs.
