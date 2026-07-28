# Phase 8.06 audit

## Classification

- `AS_IMPLEMENTED`: persisted binding ownership remains in Core; graph/cache are derived state.
- `AS_IMPLEMENTED`: direct and compiled-expression extraction, reverse indexes, deterministic
  planning, cycle isolation, revisions, cache, statistics, disposal, and visual diff integration.
- `COMPATIBLE_VARIATION`: the repository's `BindingDependency` is the canonical key contract rather
  than introducing separate value/quality/timestamp key variants.
- `COMPATIBLE_VARIATION`: current persisted bindings do not reference other binding outputs. Graph
  algorithms support these edges through the extraction boundary for future schema work.
- `FUTURE_MIGRATION`: field-selective quality/timestamp dependencies require an explicit persisted
  source contract before they can be extracted.

## Evidence

Unit and integration coverage is in `packages/binding-engine/src/incremental.test.ts`. It covers
canonical keys, AST extraction, deduplication, reverse lookup, deterministic order, cycle isolation,
structural cleanup, cold evaluation, selective reevaluation, irrelevant changes, stale revisions,
structural equality, visual diffs, and disposal.

The graph build is `O(V + E)` apart from stable ordering; ordinary affected lookup is
`O(changed keys + affected edges)`. Runtime changes do not clone or scan the graph. The documented
10,000-binding/50,000-edge case is diagnostic capacity, not a CI timing promise.

## Boundaries

No document schema, renderer, runtime store, protocol client, scheduler, DOM API, or global mutable
registry was introduced. Phase 8.05 resolution is reused directly.
