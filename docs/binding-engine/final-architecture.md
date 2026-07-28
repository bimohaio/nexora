# Binding Engine Final Architecture

Phase 8 uses a one-way dependency direction:

```text
Core definitions
      ↓
Runtime snapshots → Binding Engine → ResolvedVisualState
                                      ↓
                               renderer adapter

Designer → validation/authoring commands → Core document
```

Core owns persistence and migrations. Runtime Engine owns timestamped values, quality, revisions,
subscriptions, and immutable snapshots. Binding Engine owns parsing, validation, dependency
planning, evaluation, transformations, visual resolution, scheduling, and binding caches.
Renderers consume resolved snapshots and diffs. Designer authoring persists definitions but never
evaluates runtime expressions.

Every evaluation is explicit in its snapshot revision, timestamp, locale, and dependency set.
Graphs and cache state are instance-owned. Evaluation commits atomically after ordered traversal;
an evaluator failure is represented as a diagnostic and does not abort unrelated bindings.

The runtime/renderer bridge subscribes once, converts runtime changes to dependency keys, batches
them through the coordinator, resolves visual targets, and publishes immutable runtime visual
snapshots. It never manipulates the DOM. The SVG renderer applies only resolved runtime properties.
