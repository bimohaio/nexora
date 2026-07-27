# Runtime Engine

The Runtime Engine owns ephemeral values and their presentation-ready interpretation. It never
mutates `ScadaDocument` and has no DOM or framework dependency.

```text
Provider / Simulator -> Store -> Runtime Snapshot -> Visual Resolver
                    -> Visual Snapshot + Diff -> Frame Pipeline -> Renderer
```

`createRuntimeEngine` composes store ownership, provider lifecycle, targeted resolution,
subscriptions, diagnostics, immutable visual snapshots, batching, and reconnect behavior. Call
`start`, optionally observe events, then call idempotent `dispose`. Applications own injected
providers, loggers, schedulers, symbol registries, and renderer instances.

Phase 7 may consume visual snapshots, diffs, lifecycle events, and symbol identifiers. Phase 8 may
inject `BindingEvaluator`; expression parsing remains outside Phase 6.
