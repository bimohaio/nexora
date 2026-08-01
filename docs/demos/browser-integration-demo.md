# Browser integration demo

## Purpose

`@web-scada/runtime-demo` demonstrates the Phase 9 system in one framework-free browser
application. It loads and validates the water-treatment document, renders industrial SVG symbols,
supports viewport navigation and persisted-entity inspection, runs bindings through Runtime Engine,
and sources normalized values through Data Source Manager and the real Simulator adapter.

The demo intentionally does not implement alarms, acknowledgment, shelving, animation scheduling,
flow animation, or any other Phase 10 contract. “Toggle alarm” changes an existing symbol state for
visual demonstration only; it is not alarm processing.

## Run

```bash
pnpm install
pnpm dev:scada
```

The integrated development command serves Runtime at `http://127.0.0.1:4173` and Designer at
`http://127.0.0.1:4175`. Use:

```bash
pnpm --filter @web-scada/runtime-demo build
pnpm --filter @web-scada/runtime-demo preview
```

## User flows

- Select a node or connection in Runtime and inspect its persisted metadata.
- Open the current persisted `ScadaDocument` in the separate Designer application.
- Pan, zoom, reset, or fit the canvas.
- Start and stop Runtime without changing the persisted document.
- Connect, disconnect, reconnect, subscribe, unsubscribe, pause, reset, and change simulator
  quality.
- Inspect real manager lifecycle, connection, health, subscription, event, error, and generation
  fields.
- Inspect the latest value for each of the 18 demo tags. The inspector is bounded to 100 values and
  is not a historian.
- Select each external adapter to see accurate browser/gateway guidance.

The deterministic simulator uses sine, sequence, constant, and manual generators. It uses no
public service, random timing, or credentials.

## Lifecycle

Runtime subscription cleanup calls the manager-owned subscription handle. Disconnect stops adapter
tasks. Page disposal removes Runtime/provider listeners, disconnects and disposes the manager and
adapter, disposes Designer and Runtime engines, disconnects `ResizeObserver`, and unmounts the
renderer.

Runtime stop serializes the Designer document and compares it with the initially validated
document. Any mutation is shown as a user-facing error.

## Runtime-to-Designer handoff

`Open in Designer` stops Runtime, creates an editing session for the current published revision,
serializes only the persisted `ScadaDocument`, and places it in the target URL fragment. Runtime
values, quality, alarms, timestamps, visual overrides, and provider state are not part of that
document and therefore are not transferred. The Designer parses the payload through SCADA Core,
validates its canonical symbol metadata and SVG visual coverage, then removes the fragment from the
visible URL. An invalid document is rejected rather than rendered.

The Designer exposes the complete symbol library, editing tools, Inspector, binding authoring,
Validate, and Publish to Runtime actions. Publish messages are accepted only from the expected
Designer origin, window, editing session, document ID, and base revision. Runtime independently
validates the candidate, stores the next published revision in session storage, reloads its engines
from that document, and starts again. A stale or invalid publish is rejected without replacing the
running document.

Local development resolves the Runtime server on port 4173 to the Designer server on port 4175.
Deployments default to `/designer/`; a host application may override the target with a
`meta[name="nexora-designer-url"]` element.

## Tests

```bash
pnpm vitest run
pnpm playwright test --project runtime-demo
pnpm --filter @web-scada/runtime-demo build
```

Playwright covers startup, rendering, viewport changes, Runtime inspection, the validated
Runtime-to-Designer handoff, adding a symbol and tag binding, validation, publishing a new revision,
Runtime reload/start, quality recovery, reconnect, diagnostics, adapter guidance, and responsive
resizing.

## Security and limitations

The sample passes through `parseDocument` before rendering. The application does not use
`innerHTML`, unrestricted evaluation, embedded credentials, or public endpoints. The demo uses
tab-scoped `sessionStorage` only for the latest published demo document and revision; it is not a
production persistence layer. The handoff fragment is removed from the Designer URL immediately
after successful parsing. Cross-window messages are constrained by origin, source window, session,
document ID, and revision. External configuration text contains placeholders only.

The demo supports desktop/tablet layouts at 1024 px and above. It is not a mobile designer.
Chromium is the repository’s configured browser target. Firefox and WebKit are not claimed without
CI projects.
