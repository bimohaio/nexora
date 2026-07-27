# Interaction Benchmarks

Run:

```sh
pnpm --filter @web-scada/interaction-engine benchmark
```

The suite measures pointer processing, multi-node drag preview, selection, indexed focus traversal,
and hit testing at 100, 1,000, 5,000, 10,000, and 20,000 nodes. Every average hot-path result must
remain within the 16 ms frame budget.

The checked-in baseline is
`benchmarks/interaction-performance-baseline.json`. Results are development-environment evidence,
not cross-machine absolute guarantees; regression comparisons should use the same hardware and
runtime.
