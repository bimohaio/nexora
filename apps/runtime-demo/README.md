# Phase 9 browser system showcase

The runtime demo is the integrated browser showcase for the validated SCADA document, industrial
symbols, SVG renderer, Designer Engine selection, Runtime and Binding engines, Data Source Manager,
and deterministic Simulator adapter.

```bash
pnpm --filter @web-scada/runtime-demo dev
pnpm --filter @web-scada/runtime-demo build
pnpm --filter @web-scada/runtime-demo preview
```

Vite prints the selected local URL; the default development URL is `http://localhost:5173`.

See [the browser demo guide](../../docs/demos/browser-integration-demo.md) for capabilities,
adapter limitations, security, tests, and cleanup behavior.
