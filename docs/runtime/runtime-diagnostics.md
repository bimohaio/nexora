# Runtime diagnostics

`RuntimeDiagnosticsService` is the framework-independent issue registry. `report()` sanitizes
context, groups identical issues, updates first/last occurrence and occurrence count, derives
health, updates metrics, and optionally logs. Reporting never changes runtime decisions.

```ts
const diagnostics = new RuntimeDiagnosticsService({ suppressionThreshold: 5 });
diagnostics.report(issue);
diagnostics.getDiagnostics();
diagnostics.clear(issue.code);
```

Entries beyond the configured limit are evicted oldest-first. Repeated entries remain aggregated;
logging stops after the suppression threshold. Context keys associated with credentials, passwords,
tokens, authorization, cookies, secrets, and API keys are replaced with `[REDACTED]`.
