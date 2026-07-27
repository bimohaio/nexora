# Runtime symbol resolver

`RuntimeSymbolVisualStateResolver` resolves one symbol at a time from one or more
`RuntimeSymbolVisualInput` sources.

```ts
const resolver = new RuntimeSymbolVisualStateResolver({
  targets: [{ symbolId: "pump-1", symbolType: "process.centrifugal-pump" }],
  symbols,
  onDiagnostic: (code, message, symbolId, property) => {
    diagnostics.record({ code, message, symbolId, property });
  }
});

const state = resolver.resolve("pump-1", [
  { sourceId: "simulator", priority: 10, running: true, speed: 1450 },
  { sourceId: "operator", priority: 100, warning: true }
]);
```

Sources are ordered by ascending `priority`, then `timestamp`, then `sourceId`; later sources win.
Property bags are merged by key. This policy is protocol-independent.

`resolveMany()` receives only dirty symbol IDs. `get()` is an O(1) cache lookup. Semantically
unchanged results reuse the previous immutable object and do not increment the resolver revision.
`invalidate()` removes selected cache entries; `clear()` releases sources, overrides, and cache
entries.

The resolver validates finite numbers, known state/quality/direction values, JSON-safe data,
existing targets, bindable properties, capabilities, and overrides. Diagnostics are warnings and
resolution continues using valid fields.
