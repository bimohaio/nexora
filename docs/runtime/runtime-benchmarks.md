# Runtime benchmarks

Run `pnpm benchmark`. The deterministic suite covers 100/200, 1,000/2,000, and 5,000/10,000
symbol/update workloads plus a 10,000-update coalescing pipeline. Timing is measured for reporting,
while correctness gates remain hardware-independent to avoid flaky CI.

The checked-in baseline is `benchmarks/runtime-baseline.json`. Regression invariants require no
rejections, one callback per frame, incremental rendering, and an empty queue after flush. Absolute
CPU and latency results depend on hardware and should be captured by deployment CI.
