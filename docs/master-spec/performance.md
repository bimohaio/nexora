# Performance policy

Performance work prioritizes algorithmic behavior, stable identity, bounded
resource ownership, and representative measurements over micro-optimizations.
CI must not use unstable wall-clock thresholds. Benchmarks should record the
environment, entity counts, repetitions, medians, and known limitations.

Current Renderer coverage includes a moderate 500-node fixture. The Phase 14
specification owns broader profiling, virtualization, memory, and regression
budgets.

See also:

- [Phase 14 performance](../phases/phase-14-performance.md)
- [Incremental rendering](../architecture/incremental-rendering.md)
- [Phase 2 hardening audit](../audits/phase-2-hardening-audit.md)
