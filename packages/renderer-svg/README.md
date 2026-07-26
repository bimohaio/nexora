# @web-scada/renderer-svg

Native, framework-independent SVG viewer for readonly `ScadaDocument` snapshots.

```ts
const renderer = createSvgRenderer({
  symbols: createExampleSymbolRegistry(),
  runtimeState,
  onEvent
});

renderer.mount(container);
renderer.renderDocument(document);
renderer.setZoom(1.5);
renderer.panBy({ x: 20, y: 10 });
renderer.renderChanges(nextDocument, changes);
renderer.dispose();
```

The API supports lifecycle, full and incremental render, animation-frame scheduling, resize, viewport/zoom/pan/fit/reset, runtime-state refresh, typed options/events/errors, and entity element lookup.

Layer strategy A owns connections, nodes, and ports per layer. Entity maps preserve unchanged outer SVG elements. SVG-specific symbol adapters are injected separately from generic metadata. Definition IDs are namespaced per renderer instance.

The default SVG visual registry includes the compatible Phase 1 visuals and all
37 Phase 3 industrial visuals. Alias nodes resolve canonical metadata before
visual lookup. Visual adapters may implement `dispose(element)` for deterministic
resource cleanup.

Limitations: basic orthogonal routes have no obstacle avoidance; export is prepared but not public; text measurement/wrapping, keyboard entity navigation, designer selection/editing, binding evaluation, and very-large-scene virtualization are deferred.
