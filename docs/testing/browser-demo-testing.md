# Browser Demo Testing

Run browser-demo unit and contract tests:

```sh
pnpm vitest run apps/runtime-demo/src apps/designer-demo/src
```

Run production builds and Playwright coverage:

```sh
pnpm --filter @web-scada/runtime-demo build
pnpm --filter @web-scada/designer-demo build
pnpm --filter @web-scada/symbol-gallery build
pnpm test:e2e
```

Playwright starts isolated demo servers and verifies live runtime propagation, animation/alarm and
reduced-motion controls, revisioned Designer handoff, responsive viewports and multiple browser
instances. Resource cleanup is exercised by closing pages and by unit lifecycle tests. Scaling is
covered by runtime, visibility, alarm and renderer performance fixtures up to 5,000 entities.

When a restricted sandbox prevents binding local ports, run Playwright outside that sandbox. A local
listener `EPERM` is an environment failure, not an application assertion failure.
