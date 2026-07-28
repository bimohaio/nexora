# Binding Engine testing

Use `immediate` for direct request/return assertions and `ManualBindingSchedulingAdapter` for
coalescing, cancellation, and disposal tests without clocks or real tasks. Fault injection is
supported through the scheduler, evaluator, and outcome listener interfaces.

`coordinator.test.ts` covers all three scheduling modes, one-flush coalescing, stale request
rejection, scheduler failure recovery, partial success, last-known-valid output, removal, disposal,
fingerprint stability, LRU capacity, zero-capacity behavior, and compiled cache registry revision.
Existing `incremental.test.ts` covers graph ordering, cycles, selective evaluation, revision
rejection, structural equality, visual diffs, and instance lifecycle.

`coordinator.benchmark.test.ts` is a non-threshold diagnostic benchmark for 100, 500, 1,000, 5,000,
and 10,000 bindings, plus a burst of 1,000 requests over 1,000 bindings and 50 changing keys. It
reports initial and incremental times, evaluator counts, dirty propagation, cache-hit ratio, and
coalescing. Run it through `pnpm benchmark`; results are environment observations, not correctness
assertions.
