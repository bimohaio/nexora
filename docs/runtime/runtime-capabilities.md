# Symbol runtime capabilities

Symbol metadata declares `runtimeCapabilities`. Operational states remain compatible with
`supportedStates`; additional capabilities are:

- `open`, `enabled`
- `level`, `speed`, `flow`, `direction`
- `text`, `value`
- `rotation`, `animation`

`resolveSymbolVisualCapabilities()` creates the normalized boolean
`SymbolVisualCapabilities` contract. Capabilities can be declared explicitly or inferred from
supported states and bindable/editable properties.

The runtime resolver ignores unsupported fields and emits
`RUNTIME_VISUAL_CAPABILITY_UNSUPPORTED`. Unknown/non-bindable property keys emit
`RUNTIME_VISUAL_PROPERTY_UNKNOWN`. Missing targets emit `RUNTIME_VISUAL_TARGET_MISSING`.

Capability filtering occurs before a visual snapshot reaches the renderer, so renderers never need
symbol-specific support checks or raw-runtime interpretation.
