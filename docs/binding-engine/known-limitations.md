# Binding Engine Known Limitations

- Performance measurements are host observations; CI budgets have not yet been established.
- Visual candidate assembly currently scans cached binding outputs after an incremental evaluation.
  Only affected bindings execute, but wall time is not fully independent of document size.
- Binding graph limits are fixed defaults unless explicitly configured.
- Runtime tag acquisition and protocol security are intentionally deferred to Phase 9.
- Locale and evaluation time must be supplied explicitly for deterministic formatting and staleness.
- The designer preview is structural and diagnostic; it intentionally does not show live evaluated
  values.
- Core schema version `1.0.0` supports the current persisted binding fields. Future source kinds or
  formatter structures require migration review.

These limitations do not compromise deterministic execution, failure isolation, serialization, or
the current runtime/renderer contract.
