# Interaction Scheduler

`InteractionPerformanceScheduler` implements the existing `InteractionScheduler` contract and adds
priority, cancellation, coalescing, obsolete-work replacement, timing modes, and frame budgets.

```text
critical -> high -> normal -> low -> idle
                    |
          sequence preserves ties
```

Timing is injected through `SchedulerTimingAdapter`. Hosts may supply animation frames,
microtasks, macrotasks, and optional idle callbacks. The scheduler owns no independent loop.
Critical work completes in the current flush; overload defers other queued work.
