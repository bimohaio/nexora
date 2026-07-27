# Runtime errors

Runtime failures use `RuntimeEngineError`; raw caught values remain internal. An error has an
immutable code, category, severity, timestamp, sanitized context, recoverability flag, and optional
cause. Categories are `RUNTIME_ERROR`, `SNAPSHOT_ERROR`, `DISPATCH_ERROR`, `RESOLVER_ERROR`,
`SUBSCRIPTION_ERROR`, `SCHEDULER_ERROR`, `SIMULATOR_ERROR`, and `VALIDATION_ERROR`.

```ts
throw new RuntimeEngineError("TAG_INVALID", "The tag is invalid.", {
  category: "VALIDATION_ERROR",
  severity: "warning",
  recoverable: true,
  context: { tagId }
});
```

Causes are non-enumerable so diagnostic serialization does not accidentally disclose payloads.
Use `toRuntimeError` at package boundaries to normalize unknown failures.
