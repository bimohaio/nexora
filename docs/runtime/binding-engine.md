# Binding Engine foundation

Phase 8.00 establishes contracts only. Runtime changes will eventually become explicit
`BindingDependency` keys, evaluation results, and then existing renderer-neutral visual
state. Runtime snapshots are consumed, not owned or persisted, by the binding domain.

Normal failures are represented by `BindingEvaluationResult.status` and typed
`BindingDiagnostic` values. A failed result need not throw or invalidate other bindings.
No evaluator, dependency graph, cache, scheduler, or renderer bridge is implemented yet.

Expression sources are inert strings. A later safe language must use a controlled parser,
allowed operators/functions, deterministic execution, length/AST-depth/complexity limits,
and cancellation or execution limits. JavaScript `eval`, `new Function`, global access,
and implicit execution during parsing or validation are prohibited.
