# Phase 9 integration validation guide

```text
Adapter subscription
  → Data Source Manager generation envelope
  → Runtime ingestion and immutable revision
  → Binding coordinator
  → resolved visual state
  → SVG renderer
```

Compose adapters at the application boundary. Use the same stable ID in the adapter identity,
descriptor, and normalized addresses. Pass Runtime ingestion as the manager event sink and use
`subscribeSource` so cleanup and replacement generation checks remain centralized.

The final integration suite combines the real simulator and REST adapters with a faithful local
REST transport. Both publish a `temperature` point under distinct source IDs. It verifies value,
quality, timestamp, sequence, identity, diagnostics, failure isolation, and terminal cleanup.

```bash
pnpm vitest run tests/integration/phase-9-final-integration.test.ts
pnpm test
pnpm benchmark
```

Writes target physical adapters. Failed writes return normalized failures and cannot update Runtime
through the manager because Runtime changes only from normalized value events.

## Limitations

- Bulk cancellation is observed between operations; adapter connect/disconnect methods have no
  abort-signal parameter.
- Diagnostics provide counters, state, health, activity times, and bounded history. Windowed rates,
  latency percentiles, and quality-distribution aggregation are deferred.
- Manager routing is synchronous and owns no event queue; adapter queues are the backpressure
  boundary.
- Automatic failover and logical write redirection are deliberately unavailable.
- Browser tests cover demos and rendering, not physical protocol equipment.
