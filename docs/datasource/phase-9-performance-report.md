# Phase 9 performance report

Environment: Node.js 18.20.8. Values are observations, not narrow CI limits. Heap deltas include
garbage-collector noise and do not represent retained heap.

| Sources | Register ms | Connect-all ms | Diagnostics snapshot ms | Dispose ms | Heap delta bytes |
| ------: | ----------: | -------------: | ----------------------: | ---------: | ---------------: |
|       1 |       0.359 |          0.218 |                   0.236 |      0.077 |           96,640 |
|       5 |       0.125 |          0.036 |                   0.155 |      0.019 |           51,008 |
|      10 |       0.515 |          0.173 |                   0.094 |      0.103 |           98,352 |
|      25 |       0.261 |          0.174 |                   0.312 |      0.038 |          494,600 |
|      50 |       0.290 |          0.156 |                   0.369 |      0.096 |          483,944 |
|     100 |       0.781 |          0.178 |                   0.432 |      1.097 |       -1,740,744 |

The benchmark verifies exact snapshot counts and terminal disposal. CPU utilization is not sampled
separately; elapsed process time is the portable repository measurement. Controlled-GC retained
heap profiling remains an operational audit item.

Runtime update, Binding coordinator (100–10,000 bindings), and Interaction Engine (100–20,000
nodes) benchmarks also pass. Run `pnpm benchmark` to reproduce the suite.
