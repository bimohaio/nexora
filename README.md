# Web SCADA

A framework-independent TypeScript domain engine for long-lived industrial graphics, HMI, P&ID, BMS, electrical, water-treatment, dashboard, and digital-twin applications.

## Phase 6 status

The repository includes the Core, native SVG renderer, industrial symbol
library, Designer editing engine, advanced editing, and provider-neutral Runtime
Engine:

- Versioned `ScadaDocument` v1 model and JSON-safe extensions
- Document factory, defaults, normalization, ULID-based IDs, and injected clocks
- Structural and semantic validation with stable codes and JSON Pointer paths
- Symbol-aware port, compatibility, connection-limit, reference, and cycle validation
- Parsing, deterministic serialization, semantic versions, and migration paths
- Immutable indexes, queries, required mutations, cascades, changes, and domain events
- Pure geometry for transforms, ports, viewports, grids, rectangles, and bounds
- Metadata for the initial eight symbols with an in-memory registry
- Accessible SVG hierarchy with background, world grid, viewport, ordered layers, and overlays
- Rectangle, Text, Tank, Pump, Valve, Motor, Sensor, and Indicator Lamp visuals
- Direct, manual, and basic deterministic orthogonal connections
- Transform-aware ports, connection hit areas, markers, and medium classes
- Programmatic zoom, anchor zoom, pan, resize, reset, and fit-to-view
- Stable entity maps, incremental change sets, and animation-frame coalescing
- Provider lifecycle, tag store, batching, quality, freshness, and reconnect
- Ephemeral resolved node/connection state with targeted SVG refresh
- Designer selection, transforms, history, grouping, snapping, and connection editing
- Runtime and Designer demos with Playwright coverage

## Document example

```ts
const document: ScadaDocument = {
  schemaVersion: "1.0.0",
  id: "doc_example",
  metadata: {
    name: "Plant",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    tags: []
  },
  canvas: {
    width: 1920,
    height: 1080,
    background: "transparent",
    gridSize: 10,
    gridVisible: true,
    snapToGrid: true,
    coordinateUnit: "logical",
    defaultViewport: { x: 0, y: 0, zoom: 1 }
  },
  layers: [{ id: "layer_default", name: "Default", order: 0, visible: true, locked: false }],
  nodes: [],
  connections: [],
  variables: [],
  bindings: [],
  runtimeSettings: { refreshInterval: 250, defaultQuality: "unknown" }
};
```

See [`examples/water-treatment/minimal-process.scada.json`](examples/water-treatment/minimal-process.scada.json) for a complete symbol-aware example.

## Core usage

```ts
import {
  addNode,
  createScadaDocument,
  parseDocumentJson,
  serializeDocumentJson,
  validateDocumentSemantics
} from "@web-scada/core";
import { createExampleSymbolRegistry } from "@web-scada/symbols";

const document = createScadaDocument({ name: "Water Plant" });
const registry = createExampleSymbolRegistry();
const parsed = parseDocumentJson(importedJson, { symbolRegistry: registry });
const validation = validateDocumentSemantics(document, { symbolRegistry: registry });
const mutation = addNode(document, node, { symbolRegistry: registry });
const output = serializeDocumentJson(mutation.success ? mutation.document : document, true);
```

External values remain `unknown` until parsed. Mutation failures return the original document and structured issues.

## Structure

```text
apps/       small Phase 1 integration demos
packages/   core, geometry, symbols, renderer/engine/component boundaries
docs/       architecture, data model, ADRs, conventions, and audits
examples/   valid SCADA JSON fixtures
tests/      integration and future performance suites
tooling/    shared TypeScript, ESLint, and build configuration
```

Dependencies point inward: UI → engines → renderer → core/geometry/symbols. ESLint restrictions enforce prohibited directions. Core and geometry contain no browser globals.

## Development

```bash
pnpm install
pnpm dev
pnpm dev:runtime
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm dev` starts the Designer. `pnpm dev:runtime` starts the Phase 6
water-treatment runtime viewer.

## Runtime Engine

```ts
const runtime = createRuntimeEngine({ document, provider });
runtime.subscribe((event) => {
  if (event.type === "values")
    renderer.refreshRuntimeStates(event.affected.nodeIds, event.affected.connectionIds);
});
await runtime.start();
```

Runtime values are ephemeral and never overwrite persisted document properties.

## SVG renderer

```ts
import { createSvgRenderer } from "@web-scada/renderer-svg";
import { createExampleSymbolRegistry } from "@web-scada/symbols";

const renderer = createSvgRenderer({
  symbols: createExampleSymbolRegistry(),
  options: { gridPattern: "dots", portVisibility: "always" }
});

renderer.mount(container);
renderer.renderDocument(document);
renderer.fitToView();
renderer.renderChanges(nextDocument, changeSet);
```

Viewport semantics are `screen = canvas × zoom + translation`. The renderer consumes readonly state and never changes a document.

## Current limitations

Deferred: expression binding, production protocol adapters, alarm and historian
engines, animation scheduling, obstacle-avoiding routing, production Web
Components, persistence, authentication, collaboration, and backend services.

## Next milestone

The next planned milestone is Phase 7 interaction and accessibility hardening,
followed by Phase 8 expression binding.
