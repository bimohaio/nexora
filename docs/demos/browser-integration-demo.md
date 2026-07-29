# Browser integration demo

## Purpose

`@web-scada/runtime-demo` demonstrates the Phase 9 system in one framework-free browser
application. It loads and validates the water-treatment document, renders industrial SVG symbols,
supports viewport navigation and Designer Engine selection, runs bindings through Runtime Engine,
and sources normalized values through Data Source Manager and the real Simulator adapter.

The demo intentionally does not implement alarms, acknowledgment, shelving, animation scheduling,
flow animation, or any other Phase 10 contract. “Toggle alarm” changes an existing symbol state for
visual demonstration only; it is not alarm processing.

## Run

```bash
pnpm install
pnpm --filter @web-scada/runtime-demo dev
```

Vite normally serves `http://localhost:5173`. Use:

```bash
pnpm --filter @web-scada/runtime-demo build
pnpm --filter @web-scada/runtime-demo preview
```

## User flows

- Switch between Designer and Runtime modes.
- Select a node or connection in Designer mode and inspect its persisted metadata.
- Pan, zoom, reset, or fit the canvas.
- Start and stop Runtime mode without changing the persisted document.
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

## Tests

```bash
pnpm vitest run
pnpm playwright test --project runtime-demo
pnpm --filter @web-scada/runtime-demo build
```

Playwright covers startup, rendering, viewport changes, Designer selection, Runtime start/stop,
quality recovery, reconnect, diagnostics, adapter guidance, and responsive resizing.

## Security and limitations

The sample passes through `parseDocument` before rendering. The application does not use
`innerHTML`, unrestricted evaluation, browser storage, embedded credentials, or public endpoints.
External configuration text contains placeholders only.

The demo supports desktop/tablet layouts at 1024 px and above. It is not a mobile designer.
Chromium is the repository’s configured browser target. Firefox and WebKit are not claimed without
CI projects.
