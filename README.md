# Nexora Web SCADA

Phase 9 datasource integration validation and production-readiness evidence is summarized in the
[Phase 9.08 final audit](docs/datasource/phase-9-08-final-audit.md).

A framework-independent TypeScript toolkit for building long-lived industrial graphics, HMI,
P&ID, BMS, electrical, water-treatment, manufacturing, dashboard, and digital-twin applications.

Nexora separates its immutable SCADA document model from editing, interaction, rendering, live
data, and protocol adapters. The packages run in browsers or Node.js where their boundaries allow;
Core and Geometry contain no browser globals.

## What is included

### Document and domain engine

- Versioned `ScadaDocument` v1 model with JSON-safe extension points
- Factories, defaults, normalization, ULID-based IDs, and injectable clocks
- Structural and semantic validation with stable codes and JSON Pointer paths
- Symbol-aware port compatibility, connection limits, reference checks, and cycle validation
- Safe parsing, deterministic serialization, semantic versions, and migration paths
- Immutable indexes, queries, mutations, cascade handling, change sets, domain events, and command
  contracts

### Geometry, symbols, and SVG rendering

- Pure geometry for transforms, ports, viewports, grids, rectangles, bounds, and spatial queries
- Metadata-driven registry containing 37 industrial symbols across process, instrumentation,
  electrical, BMS, safety, and network/control categories
- Symbol aliases, editable and bindable property metadata, ports, states, and runtime capabilities
- Accessible SVG hierarchy with background, world grid, viewport, ordered layers, and overlays
- Direct, manual, and deterministic orthogonal connections with transform-aware ports, markers,
  hit areas, and medium classes
- Programmatic and anchored zoom, pan, resize, reset, fit-to-view, incremental rendering, stable
  entity maps, and animation-frame coalescing

### Designer and interaction

- Selection, multi-selection, pluggable tools, clipboard operations, and command-based undo/redo
- Move, resize, rotate, group/ungroup, align, distribute, order, layer reassignment, lock, and hide
- Grid and object snapping with deterministic ranking, keyboard nudging, and cancelable sessions
- Connection creation, endpoint reassignment, and waypoint editing
- Pointer and keyboard engines, hit testing, coordinate conversion, focus navigation, command
  routing, ARIA metadata, screen-reader announcements, and live-region support
- Spatial indexing, batching, caching, scheduling, metrics, diagnostics, and performance benchmarks
- Binding authoring for create, edit, remove, duplicate, validate, preview, import, and export,
  integrated with designer history

### Runtime and data binding

- Immutable, timestamp-aware tag store with canonical JSON-safe values, quality, freshness, and
  atomic batch ingestion
- Revisioned snapshots and diffs, filtered subscriptions, provider lifecycle, reconnect backoff,
  scheduling, dispatch coalescing, diagnostics, health, recovery, latency, cache, and memory metrics
- Ephemeral node, text, visibility, property, and connection-style state with targeted renderer
  invalidation; runtime values never overwrite the persisted document
- Direct tag, variable, and constant bindings plus a sandboxed expression language with a readonly
  AST, allowlisted pure functions, bounded evaluation, and no JavaScript execution
- Deterministic transformations, exact-value mapping, formatting, thresholds, dependency tracking,
  incremental evaluation, bounded LRU caches, scheduling, and per-binding failure isolation
- Renderer-neutral resolved visual snapshots, revisioned diffs, and runtime/renderer integration

### Data sources

- Protocol-independent adapter contracts for identity, capabilities, permissions, lifecycle,
  reconnect, subscriptions, normalized values, batch operations, errors, and diagnostics
- Shared subscription ownership and restoration across reconnects
- Runtime bridge for ingesting normalized adapter events without coupling protocols to the engine
- Deterministic simulator with constant, sequence, toggle, counter, sine, random-range,
  random-walk, and manual generators
- Fetch-compatible REST polling with declarative JSON mapping, optional writes, authentication
  injection, request/response limits, host allowlists, and SSRF-conscious defaults
- Persistent WebSocket streaming with JSON mapping, local or command-based subscriptions,
  reconnect recovery, bounded queues, heartbeats, authentication injection, and secure defaults

## Packages

| Package                           | Responsibility                                                          |
| --------------------------------- | ----------------------------------------------------------------------- |
| `@web-scada/core`                 | Persisted document model, validation, migration, queries, and mutations |
| `@web-scada/geometry`             | Browser-neutral geometry, transforms, and viewport calculations         |
| `@web-scada/symbols`              | Industrial symbol metadata, aliases, ports, and registry                |
| `@web-scada/renderer-svg`         | Accessible SVG rendering, connections, overlays, and viewport           |
| `@web-scada/designer-engine`      | Editing tools, history, authoring workflows, and transient state        |
| `@web-scada/interaction-engine`   | Pointer, keyboard, accessibility, spatial, and performance systems      |
| `@web-scada/runtime-engine`       | Live values, providers, snapshots, visual state, metrics, and simulator |
| `@web-scada/binding-engine`       | Direct/expression evaluation and visual-property resolution             |
| `@web-scada/datasource-core`      | Protocol-neutral adapter lifecycle, subscriptions, and runtime bridge   |
| `@web-scada/datasource-simulator` | Deterministic normalized data-source adapter                            |
| `@web-scada/datasource-rest`      | Secure REST polling and optional write adapter                          |
| `@web-scada/datasource-websocket` | Persistent WebSocket streaming adapter                                  |
| `@web-scada/web-components`       | Reserved custom-element adapter boundary; no production UI yet          |
| `@web-scada/shared`               | Minimal shared package boundary                                         |

All packages are private workspace packages at version `0.0.0`; the repository is currently a
source toolkit rather than a published npm release.

## Demos and examples

- `pnpm dev` starts the Designer demo with a symbol palette, selection and transform tools,
  connection editing, undo/redo, property controls, and binding authoring.
- `pnpm dev:runtime` starts the water-treatment runtime viewer with viewport controls, live state
  and quality changes, pause/reset, overrides, and reconnect behavior.
- `pnpm --filter @web-scada/symbol-gallery dev` starts the 37-symbol gallery.
- [`examples/water-treatment/minimal-process.scada.json`](examples/water-treatment/minimal-process.scada.json)
  is a compact end-to-end document.
- [`examples/industrial`](examples/industrial) contains process, instrumentation, electrical, BMS,
  and mixed-system documents. Additional example notes cover
  [`electrical`](examples/electrical), [`manufacturing`](examples/manufacturing), and
  [`water treatment`](examples/water-treatment).

## Quick start

Prerequisites: Node.js 18.18 or newer and pnpm 9.15.9.

```bash
pnpm install
pnpm dev
```

Create, validate, mutate, and serialize a document:

```ts
import {
  addNode,
  createScadaDocument,
  parseDocumentJson,
  serializeDocumentJson,
  validateDocumentSemantics
} from "@web-scada/core";
import { createIndustrialSymbolRegistry } from "@web-scada/symbols";

const symbols = createIndustrialSymbolRegistry();
const document = createScadaDocument({ name: "Water Plant" });
const parsed = parseDocumentJson(importedJson, { symbolRegistry: symbols });
const validation = validateDocumentSemantics(document, { symbolRegistry: symbols });
const mutation = addNode(document, node, { symbolRegistry: symbols });
const output = serializeDocumentJson(mutation.success ? mutation.document : document, true);
```

External values remain `unknown` until parsed. Failed mutations return the original document with
structured issues.

Render the document:

```ts
import { createSvgRenderer } from "@web-scada/renderer-svg";

const renderer = createSvgRenderer({
  symbols,
  options: { gridPattern: "dots", portVisibility: "always" }
});

renderer.mount(container);
renderer.renderDocument(document);
renderer.fitToView();
renderer.renderChanges(nextDocument, changeSet);
```

Viewport semantics are `screen = canvas × zoom + translation`. The renderer consumes readonly
state and never mutates a document.

Connect runtime values:

```ts
const runtime = createRuntimeEngine({ document, provider });

runtime.subscribe((event) => {
  if (event.type === "values") {
    renderer.refreshRuntimeStates(event.affected.nodeIds, event.affected.connectionIds);
  }
});

await runtime.start();
```

See the package READMEs and [`docs/runtime`](docs/runtime) for binding evaluation, simulator,
data-source bridge, lifecycle, snapshots, and visual-state integration.

## Repository structure

```text
apps/       Designer, runtime viewer, and symbol-gallery demos
packages/   Domain, rendering, editing, interaction, runtime, binding, and data-source packages
docs/       Specifications, architecture, APIs, ADRs, audits, runtime guides, and roadmap
examples/   Valid SCADA JSON fixtures and domain-specific example notes
tests/      Integration, end-to-end, and performance suites
tooling/    Shared TypeScript, ESLint, and build configuration
```

Dependencies point inward: applications and adapters depend on engines; engines depend on Core,
Geometry, and Symbols. ESLint restrictions enforce prohibited directions.

## Development and quality checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm benchmark
pnpm build
```

The benchmark command exercises runtime, interaction, and binding workloads, including the binding
diagnostic matrix up to 10,000 bindings.

## Documentation

Start with [`docs/README.md`](docs/README.md). The
[`master specification`](docs/master-spec/README.md) defines project-wide architecture and policy;
subsystem guides document the implemented APIs, and the implementation is the final evidence of
current availability.

## Current scope and limitations

Implemented work currently spans the foundation through the Phase 9 data-source adapters.
Remaining roadmap items include broader production protocol adapters, alarms and historian,
animation scheduling, obstacle-avoiding connection routing, persistence, authentication and
authorization services, collaboration, backend services, and a production custom-element UI.

The REST and WebSocket adapters provide secure protocol foundations, not a complete industrial
gateway: OPC UA, MQTT, Modbus, BACnet, and vendor-specific transports are not included.
