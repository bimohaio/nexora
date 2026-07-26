# SVG attributes

Renderer entities use stable data attributes:

- `data-entity-type`
- `data-entity-id`
- `data-node-id`
- `data-connection-id`
- `data-port-id`
- `data-layer-id`
- `data-visible`
- `data-locked`
- `data-medium`
- `data-direction`

SVG is created only with `createElementNS`. Numeric attributes use string conversion, optional attributes are removed when absent, and user-visible text uses `textContent`.
