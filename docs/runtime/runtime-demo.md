# Runtime demo

The production-style water-treatment demo composes the SVG renderer, example symbol registry,
Runtime Engine, frame render pipeline, and a provider simulator. It demonstrates analog tank level,
boolean/process state, alarms, warnings, uncertain and offline quality, operator disable overrides,
reconnect behavior, batching, reset, pause, and resource cleanup.

```text
SimulatedProcessProvider
        -> ProviderRuntimeEngine
        -> immutable visual commit
        -> RuntimeRenderPipeline
        -> SvgRenderer.renderRuntimeChanges
```

Runtime owns transient values and visual resolution. The renderer owns SVG. The application owns
composition and controls, using package APIs rather than editing rendered entities directly.
