# Binding Engine Performance Report

Environment: Node v18.20.8, macOS development host. Measurements are diagnostic single-run values,
not release thresholds.

| Bindings | Initial evaluation | Single-key update | Evaluated on update | Cache hit ratio |
| -------: | -----------------: | ----------------: | ------------------: | --------------: |
|      100 |            3.03 ms |           0.61 ms |                   1 |            100% |
|      500 |            4.67 ms |           3.73 ms |                   1 |            100% |
|    1,000 |           10.02 ms |           7.82 ms |                   1 |            100% |
|    5,000 |           30.05 ms |          21.87 ms |                   1 |            100% |
|   10,000 |           84.50 ms |          38.95 ms |                   1 |            100% |

A separate burst of 1,000 requests across 1,000 bindings coalesced into one coordinator execution
in 10.57 ms. Dirty propagation was one binding for each single-key case.

The update still rebuilds a renderer-neutral visual candidate snapshot, explaining why wall time
grows with total binding count even though evaluator execution remains O(affected bindings). This
is recorded as an optimization opportunity, not a correctness failure.

Run `pnpm benchmark` to reproduce. Results vary by host and should be compared in a controlled CI
environment before establishing budgets.
