# Runtime visual priority and overrides

Only one effective visual state is selected. Priority is deterministic:

```text
disabled
   |
offline
   |
 alarm
   |
warning
   |
running / active / open
   |
stopped / inactive
   |
 normal
```

Quality `offline` contributes the offline flag when the symbol supports it. An explicit
`enabled: false` contributes disabled state. `open` maps to the renderer-neutral active visual
state because the shared `SymbolState` contract has no separate open presentation state.

Temporary overrides use:

```ts
engine.setVisualOverride("pump-1", { alarm: true });
engine.clearVisualOverride("pump-1");
```

Overrides have precedence over ordered runtime sources, remain outside the persisted document, and
are included in resolved state for inspection. Source-order fields are forbidden in overrides.
Invalid overrides are rejected with `RUNTIME_VISUAL_OVERRIDE_INVALID`.
