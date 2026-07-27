# Runtime logging

Logging is optional and injected through `RuntimeEngineOptions.logger`. Core runtime packages never
call `console`. A logger implements one method:

```ts
const logger: RuntimeLogger = {
  log(entry) {
    transport.write(entry);
  }
};

const engine = createRuntimeEngine({ document, provider, logger });
```

Levels are `debug`, `info`, `warn`, `error`, and `fatal`. Entries contain structured, sanitized
context and can be formatted lazily by the implementation. `NoopRuntimeLogger` is the default;
`MemoryRuntimeLogger` is provided for tests and diagnostics tooling. Aggregation prevents repeated
issues from flooding the logger.
