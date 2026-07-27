# Interaction performance

The interaction benchmark covers 100, 1,000, 5,000, 10,000, and 20,000 nodes.
It measures pointer normalization, drag preview updates, selection replacement,
focus traversal, hit testing, and heap deltas. The quality threshold is an average
operation time below the 16 ms frame budget.

Run it with:

```sh
pnpm benchmark
```

The 2026-07-27 validation run passed every scale. At 20,000 nodes the slowest
operation was selection replacement at 14.44 ms average; hit testing averaged
1.57 ms, drag 0.046 ms, pointer 0.001 ms, and focus 0.001 ms. Results vary with
hardware, JIT warm-up, garbage collection, and development-build instrumentation,
so they are regression indicators rather than browser FPS guarantees. The baseline
is stored in `benchmarks/interaction-performance-baseline.json`.
