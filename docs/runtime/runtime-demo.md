# Runtime demo

## Phase 10.03 symbol animation showcase

The water-treatment runtime includes six dedicated animated symbols: fan, valve, tank, lamp,
encoder and pipe. They demonstrate rotation, openness, level, opacity and flow while leaving the
interactive process line stable for selection and Designer handoff. Controls support play,
pause/resume, restart, stop, 0.5–4× speed overrides and reduced motion. Runtime start/stop,
document visibility and disposal are connected to the same animation lifecycle.

The showcase discovers slots from the symbol registry and uses `RuntimeAnimationManager` with
`SvgSymbolAnimationAdapter`; it has no symbol-type switches, per-symbol timers or separate demo
interpolation path.

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
