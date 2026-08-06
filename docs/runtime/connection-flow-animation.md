# Connection flow runtime guide

Add optional `flowAnimation` configuration to a connection. Legacy connections without it render unchanged. Persisted fields include mode, primitive, speed, direction, visual settings, policies and binding IDs. Runtime phase, elapsed time, scheduler handles and renderer caches are never serialized.

`RuntimeConnectionFlowManager` receives the application's existing shared scheduler. Call `loadDocument`, then start that scheduler. Use `update` for enabled, speed, direction, quality, alarm, flow percentage and visibility. `pause`, `resume`, `stop` and `dispose` are idempotent at their intended lifecycle boundary.

Supported built-in visual modes are `none`, `dash`, `marker`, `arrow`, `highlight`, `gradient` foundation and `particle-foundation`. Marker count is capped at 64 by default. Invalid numeric values, identifiers, bindings and plugin registrations are rejected with bounded typed diagnostics.

Plugins can register flow modes, marker descriptors, renderer-neutral sample consumers, diagnostic formatters and preview providers through `ConnectionFlowPluginRegistry`. SVG element references and renderer internals are not exposed.
