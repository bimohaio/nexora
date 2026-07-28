# Binding failure isolation

Incremental evaluation catches unexpected evaluator failures at the binding boundary and continues
the deterministic graph order. Successful unrelated candidates still reach one atomic visual
resolution pass. Reports use `partial` when failures and valid work coexist.

The default transient policy is `KEEP_LAST_VALID`: if a binding previously committed a result, a
later thrown evaluation remains visible in batch diagnostics while the prior result continues to
feed visual resolution and eligible downstream work. When no valid prior result exists, the error
result is retained explicitly. Binding removal clears its cached result and graph entry, so late
work cannot restore it.

Expected expression, mapping, formatting, threshold, and quality failures continue to use their
existing typed `BindingEvaluationResult` diagnostics and persisted fallback rules. This coordinator
does not add recursive fallback evaluation or automatic retries.

Scheduling failures, cancellation failures, stale executions, and disposal have distinct diagnostic
codes. Listener failures never invalidate an accepted result. Coordinator instances share no queue,
generation, cache, diagnostics, or commit state.
