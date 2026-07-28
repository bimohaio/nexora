# Phase 8 roadmap

Phase 8.00 provides the binding contract foundation. Phase 8.01 now provides strict direct
runtime-value evaluation, quality/staleness policy, explicit fallback, dependency
extraction, registry contribution, and isolated batch evaluation.

Phase 8.02 now provides the versioned safe expression language, tokenizer, parser, readonly
AST, static validation and dependency extraction, controlled built-ins, deterministic
resource limits, expression binding evaluation, and isolated batch results.

Phase 8.07 adds explicit immediate/deferred/manual scheduling, coalescing, bounded caches,
revision/generation safety, cancellation/disposal, and binding-level failure isolation.

Deferred work:

- 8.03 mapping and formatting;
- 8.04 thresholds and conditional bindings;
- 8.05 visual property resolution;
- 8.06 dependency graph and incremental evaluation;
- 8.08 runtime and renderer integration;
- 8.09 designer authoring;
- 8.10 integration validation and final audit.

Phase 8.00 intentionally contains no evaluator, parser, scheduler, formatter, threshold
engine, renderer mutation, UI, or data-source adapter.
