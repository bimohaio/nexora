# Binding Engine API

`@web-scada/binding-engine` is the renderer-neutral evaluation package. Core owns serialized
`PropertyBinding` definitions; Runtime Engine owns runtime values and immutable snapshots.

## Stable entry points

- `BindingDefinition`, dependencies, diagnostics, results, and execution reports are readonly
  contracts.
- `evaluateDirectBinding` and `evaluateExpressionBinding` are deterministic synchronous
  evaluators.
- `compileExpression` produces a bounded, inert AST and extracted dependencies.
- `compileValueMapping`, `compileValueFormat`, and threshold compilers produce reusable immutable
  plans.
- `BindingDependencyGraph` owns cycle detection, ordering, and affected-set calculation.
- `IncrementalBindingEngine` evaluates only the graph plan and retains last valid results.
- `BindingEvaluationCoordinator` adds coalescing, scheduling, cancellation, and bounded caching.
- `VisualPropertyResolver` resolves renderer-neutral visual state and diffs.
- `RuntimeBindingRendererIntegration` connects runtime snapshots to a
  `renderRuntimeChanges(snapshot, diff)` consumer.
- `validateBindingDefinition` and `validateDocumentBindings` are safe authoring hooks.

## Lifecycle

Coordinators and runtime integrations are instance-owned. Call `dispose()` when their session ends.
Disposal is idempotent, clears queues and caches, and unsubscribes from the runtime store. Caller
owned stores and renderers are not disposed.

## Compatibility

All persisted definitions are Core `PropertyBinding` values at schema version `1.0.0`. The package
does not introduce a second serialized discriminator. Diagnostics are additive; consumers should
branch on documented codes and tolerate new codes.

See [API review](../binding-engine/api-review.md) and
[final architecture](../binding-engine/final-architecture.md).
