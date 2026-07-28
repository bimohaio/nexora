# Binding scheduling

`BindingEvaluationCoordinator` is an instance-owned execution boundary around
`IncrementalBindingEngine`. The incremental engine and its Phase 8.06 dependency graph remain the
only affected-subgraph planner.

The default mode is `deferred` with a microtask adapter. `immediate` evaluates before
`requestEvaluation` returns when no execution is active. `manual` retains work until `flush`.
Tests can inject `ManualBindingSchedulingAdapter`; renderer frame scheduling is not part of this
contract.

Pending requests use latest-state coalescing. Dependency and binding identifiers are deduplicated,
full reevaluation dominates narrow changes, and the highest snapshot revision supplies the context.
There is at most one scheduled flush per coordinator. Explicit `flush` cancels that handle before
draining, and reentrant requests are bounded by `maxPassesPerDrain`.

Requests require a non-negative safe-integer revision matching the immutable runtime snapshot.
Each pass receives a coordinator/generation/execution/runtime/graph token. A result commits only if
the token still matches current state. Lower revisions are typed `superseded` outcomes, not
evaluation errors.

`cancelScheduled` is idempotent. `reset` cancels pending work, clears owned cache state, and advances
the generation. `dispose` additionally releases the engine; later requests return `disposed`.
Scheduler and listener exceptions are isolated and pending work remains available to explicit
`flush` after a scheduler failure.
