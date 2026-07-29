# Phase 9.07 audit

## Outcome

The protocol-neutral manager foundation is implemented in datasource-core. Registry ownership,
serialized lifecycle orchestration, dependency ordering, mixed bulk outcomes, generation-safe
routing, subscription cleanup, dynamic replacement, health assessment, diagnostics, bounded
journal storage, listener isolation, and secret redaction are covered by focused tests.

This phase is **PARTIAL**, not PASS: the full prompt also requires dedicated cross-protocol Runtime
integration, race/failure matrices, rate/latency metrics, configuration transactions, demo work,
and performance/soak evidence.

## Scope classification

- PASS: registry, ownership, core lifecycle, mixed bulk outcomes, central normalized routing,
  subscription cleanup, replacement generation cutoff, basic policy health, aggregate critical
  health, counters, bounded journal, readonly snapshots, redaction, and disposal.
- PARTIAL: cancellation (between operations only), diagnostics metrics, Runtime integration
  evidence, logging tests, configuration planning, test matrix breadth, and demo.
- NOT_APPLICABLE: manager buffering/backpressure (delivery is synchronous), automatic failover, and
  logical write routing.
- FAIL: none known.

## Quality-gate evidence

| Command                                                        | Result  | Notes                                                                  |
| -------------------------------------------------------------- | ------- | ---------------------------------------------------------------------- |
| `pnpm format:check` (pre-change baseline)                      | PASS    | Repository formatted before implementation                             |
| `pnpm format:check` (post-change)                              | PASS    | All files formatted                                                    |
| `pnpm lint`                                                    | PARTIAL | New files pass focused ESLint; 25 pre-existing errors remain in Modbus |
| `pnpm --filter @web-scada/datasource-core typecheck`           | PASS    | New public API and tests compile                                       |
| `pnpm vitest run packages/datasource-core/src/manager.test.ts` | PASS    | 8 tests                                                                |
| `pnpm typecheck`                                               | PASS    | All workspace packages and apps                                        |
| `pnpm test` (sandbox)                                          | PARTIAL | 415 passed; 3 OPC UA tests could not bind localhost (`EPERM`)          |
| `pnpm test` (local-server permission)                          | PASS    | 68 files, 418 tests                                                    |
| `pnpm build`                                                   | PASS    | All workspace packages and apps                                        |

## Security evidence

The redaction test uses `PHASE_9_07_SECRET_MUST_NOT_APPEAR` and fails if the sentinel appears in
serialized redacted output. It covers nested arrays, sensitive keys, bearer text, credential URI
user info, and circular input. Descriptors are documented as non-secret metadata and the manager
does not retain adapter factory arguments.

## Compatibility

No existing public datasource contract was renamed or removed. The manager extends datasource-core
exports and delegates all protocol operations through `DataSourceAdapter`. Runtime and renderer
packages remain free of concrete protocol imports.
