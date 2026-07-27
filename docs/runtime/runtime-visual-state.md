# Runtime visual state

Runtime values and renderer state are separate models:

```text
Raw provider/simulator values
          |
          v
Runtime store and binding targets
          |
          v
RuntimeSymbolVisualStateResolver
          |
          v
ResolvedSymbolVisualState
          |
          v
Immutable visual snapshot -> renderer
```

`ResolvedSymbolVisualState` is renderer-neutral. It contains one `effectiveState`, normalized flags,
quality, visibility, supported process values (`level`, `speed`, `flow`, `direction`, `text`, and
`value`), immutable properties, and active temporary overrides.

The SVG renderer reads `getNodeVisualState()` and does not receive provider records or apply state
priority. Compatible legacy state-reader methods remain as fallbacks for external integrations.

Visual state never mutates `ScadaDocument`. Engine overrides produce normal incremental snapshot
commits and can therefore pass through subscriptions, the frame pipeline, and any renderer.
