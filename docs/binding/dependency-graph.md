# Dependency graph and incremental evaluation

Phase 8.06 is implemented by `@web-scada/binding-engine`. The graph is derived, instance-owned
runtime state; it is not serialized into `ScadaDocument` and contains no renderer or protocol
objects.

## Identity and extraction

Dependencies reuse the Phase 8 `BindingDependency` union. Canonical keys use a discriminator plus
length-prefixed components, so punctuation cannot create collisions. Runtime and document
identifiers are trimmed only where their defining evaluator already trims them; otherwise identity
is case-sensitive and Unicode-preserving.

Direct tag sources depend on one `runtime-value`. Expression dependencies come from the validated
compiled AST artifact, never from regular expressions. Mapping, formatting, and threshold
transforms inherit the source binding's dependencies because their rules are static. Current
persisted definitions do not expose quality-only, timestamp-only, or binding-output sources.
The graph nevertheless supports explicit `binding` edges through an injected extractor for future
derived-binding contracts without changing persisted documents.

## Graph and ordering

`BindingDependencyGraph` maintains forward dependency records, a dependency-to-consumer reverse
index, and binding-output downstream edges. Public arrays and diagnostics are frozen snapshots.
Structural changes increment the graph revision. Duplicate IDs, unresolved outputs, configured
limits, and cycles produce typed diagnostics.

Topological ordering uses Kahn's iterative algorithm. Canonical binding ID is the tie-breaker.
Cyclic bindings are omitted from executable order while independent acyclic components continue.
Affected traversal starts from reverse-index matches, is iterative, deduplicates fan-in, and returns
the affected subset in topological order.

Default safety limits are 10,000 bindings, 256 dependencies per binding, 50,000 edges, and 128 IDs
in a cycle diagnostic. These are diagnostic-scale limits, not a real-time latency guarantee.

## Incremental engine

`IncrementalBindingEngine` is synchronous and single-owner. It is not reentrant or thread-safe.
`evaluateAll` performs cold evaluation. `evaluateChanges` accepts normalized dependency changes,
rejects malformed or non-monotonic input revisions, evaluates only the plan, and atomically
publishes its result cache after the batch succeeds.

Outputs use exact structural equality: `Object.is` for primitives (therefore `NaN` equals `NaN`
and `-0` differs from `0`), ordered array comparison, and sorted-key object comparison. Status and
diagnostics participate in equality; no numeric epsilon is applied. Failures are converted to a
typed per-binding error and independent bindings continue. A later relevant input change retries
the failed binding.

The engine passes the complete cached candidate set to the existing Phase 8.05
`VisualPropertyResolver`. Its returned `VisualPropertyChangeSet` is the renderer-neutral incremental
diff and includes only added, updated, or removed resolved properties. An explicit locale is
required in evaluation context for deterministic formatting.

Runtime Engine's existing `RuntimeChangeSet` can be converted with
`runtimeChangeSetToBindingChanges`. Scheduling, batching policy, subscriptions, and renderer
invalidation stay with their owning packages.

```ts
const engine = new IncrementalBindingEngine(document.bindings);
const initial = engine.evaluateAll({ runtime: store.snapshot(), locale: "en-US" });

const next = engine.evaluateChanges(
  { runtime: store.snapshot(), locale: "en-US" },
  runtimeChangeSetToBindingChanges(notification.changes)
);
render(next.visualDiff);
```

`reset()` clears evaluation and visual caches. `dispose()` is idempotent and later use returns a
typed diagnostic.
