# Binding incremental execution

Runtime changes are converted to canonical `BindingDependency` values. The coordinator coalesces
them, then delegates reverse-index traversal and topological ordering to
`BindingDependencyGraph.affected`. It does not construct a second graph.

Evaluation stages results in the incremental engine, validates revisions, resolves renderer-neutral
visual properties, and publishes one immutable result and visual diff. Equal outputs emit no visual
change. Binding-definition changes and forced bindings conservatively request a full graph pass;
future field-selective binding update plans can narrow this without changing public persistence.

The implementation is synchronous internally and deferrable at the scheduling boundary. This keeps
unit tests deterministic. Concurrent asynchronous evaluators and worker transport are intentionally
not introduced; execution tokens and generation checks define the stale-commit boundary for a future
compatible async implementation.
