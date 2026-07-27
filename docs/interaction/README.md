# Interaction documentation

Phase 7 provides one renderer-independent interaction platform for pointer input,
hit testing, selection, drag, keyboard navigation, focus, accessibility, scheduling,
and diagnostics.

- [Architecture](architecture.md)
- [Event flow](event-flow.md)
- [Lifecycle](interaction-lifecycle.md)
- [Integration and validation](integration.md)
- [Performance](performance.md)
- [Accessibility](accessibility.md)
- [Migration](migration.md)
- [Final validation report](integration-validation-report.md)

The package does not own DOM visuals or application documents. Host adapters
normalize input, Designer Engine owns document commands, and renderer adapters own
visual and semantic projection.
