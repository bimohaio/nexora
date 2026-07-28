# Phase 8 Integration Report

## Validated flow

Core definitions serialize and parse without losing binding fields. Binding validation checks
references and targets. Runtime changes become normalized dependency keys; the graph calculates a
stable affected order; the incremental engine evaluates that order; visual resolution emits a
target diff; the runtime integration sends the immutable snapshot and diff to the renderer.

Designer create, update, delete, duplicate, import, and paste operations use command history.
Binding previews remain descriptive and do not run expressions.

## Test evidence

- Direct, expression, mapping, formatting, threshold, visual property, dependency, incremental,
  coordinator, runtime-renderer, and designer-authoring suites cover their respective boundaries.
- Runtime integration tests verify revision flow, immutable snapshots, targeted dispatch, failure
  isolation, and cleanup.
- Core document tests cover binding serialization and semantic validation.
- Renderer tests verify runtime changes are applied incrementally.
- The complete non-benchmark suite passed on 2026-07-28: 52 files and 338 tests.

The final benchmark adds five required binding populations and asserts one evaluation for a
single-key update at every population.

## Lifecycle and memory

Coordinator disposal cancels scheduled work, drops pending batches, clears the bounded result cache,
and disposes the incremental engine. Incremental disposal clears evaluated results and visual
state. Runtime integration unsubscribes from the store, disposes its coordinator, and releases its
renderer reference. Compiled and mapping caches are bounded or instance/weak-key owned, so no
process-global document graph retains disposed sessions.
