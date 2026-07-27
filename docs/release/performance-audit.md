# Interaction performance and memory audit

Environment: macOS, Node development build, pnpm 9.15.9, Vitest 2.1.9. Results are
microbenchmark averages and not browser FPS claims.

|  Nodes |  Pointer |     Drag | Selection |    Focus | Hit testing |
| -----: | -------: | -------: | --------: | -------: | ----------: |
|    100 | 0.004 ms | 0.023 ms |  0.111 ms | 0.001 ms |    0.029 ms |
|  1,000 | 0.002 ms | 0.005 ms |  0.265 ms | 0.001 ms |    0.054 ms |
|  5,000 | 0.001 ms | 0.015 ms |  1.572 ms | 0.001 ms |    0.166 ms |
| 10,000 | 0.002 ms | 0.066 ms |  2.490 ms | 0.001 ms |    0.306 ms |
| 20,000 | 0.001 ms | 0.202 ms |  4.807 ms | 0.001 ms |    0.612 ms |

All nine runtime and interaction benchmark cases pass the 16 ms average operation
budget. Compared with the Phase 7.06 baseline, the final 20,000-node selection
result is 4.807 ms versus 4.791 ms; the 0.3% difference is within run-to-run
measurement noise and remains below the frame budget.

Memory evidence:

- the benchmark samples heap deltas at every required scale;
- caches have explicit clear/invalidation methods;
- object pools have bounded capacity and disposal;
- scheduled callbacks are cancelled on disposal;
- listeners and subscriptions return unsubscribe functions or are cleared;
- active sessions cancel and dispose terminal state;
- accessibility clears tree, listeners, renderer state, and live-region queues.

The largest final sampled delta was approximately 16.6 MB during 20,000-node
selection replacement. Garbage collection makes individual deltas nondeterministic.
No retained-growth browser soak measurement or real FPS trace exists, so FPS,
cache-hit ratio, and long-duration leak certification are PARTIAL rather than
inferred from latency tests.
