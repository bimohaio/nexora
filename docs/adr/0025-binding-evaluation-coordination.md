# ADR 0025: Instance-owned binding evaluation coordination

Status: Accepted

## Decision

Binding evaluation uses a single-active-pass coordinator with latest-state request coalescing.
Scheduling is injected and supports immediate, microtask-deferred, and manual modes. Phase 8.06
remains the sole dependency planner.

Every execution carries coordinator, generation, execution, runtime, and graph identity. Commit is
allowed only while those identities remain current. Reset, document-level semantic replacement, and
disposal advance the generation.

Definition-derived and runtime-derived caches are separate, bounded, instance-owned LRU structures.
Expression artifacts include language, resource limits, source, and registry revision in their key.
Evaluator failures are binding-scoped; the default transient behavior keeps a last valid result while
reporting the current failure.

## Consequences

Bursts schedule one bounded pass, cache state cannot leak across documents, stale and removed work
cannot commit, and one failed branch does not abort unrelated visual changes. The coordinator stays
framework, renderer, browser-loop, and protocol neutral. Async concurrent evaluation, automatic
retry, and field-selective binding-definition updates remain future extensions.
