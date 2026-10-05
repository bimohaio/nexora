# Phase 11.04 — History retention audit

## Requirement traceability and final audit

| Requirement                     | Status         | Evidence                                                                              | Tests                                        | Remaining risk                                                                                  |
| ------------------------------- | -------------- | ------------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Repository audit                | PASS           | History, Designer adapter, transaction, merge, document and lifecycle paths inspected | Existing Phase 11 suites                     | None critical                                                                                   |
| Entry limits/config validation  | PASS           | Immutable default `maxEntries=100`; zero disables retention                           | Engine and retention tests                   | Runtime changes intentionally unsupported                                                       |
| Oldest-first/undo boundary      | PASS           | Head eviction after logical commit                                                    | Multiple-prune and 10,000-operation tests    | `Array.shift` is linear, but arrays are bounded by default                                      |
| Transaction atomicity           | PASS           | Retention sees one entry after commit                                                 | Oversized two-operation transaction test     | None critical                                                                                   |
| Redo correctness/cleanup        | PASS           | Stack moves preserve cost; divergent commit releases redo                             | Redo-accounting and round-trip tests         | None critical                                                                                   |
| Merge/compression accounting    | PASS           | Re-estimation replaces old cost; no-op releases old entry                             | Merge and retention suites                   | Estimator quality belongs to caller                                                             |
| Memory budget/oversized entry   | PASS           | Injected estimator, oldest pruning, warning diagnostics                               | Budget, failure and oversized tests          | Estimates are not heap measurements                                                             |
| Clear/dispose/reference cleanup | PASS           | Arrays, map, transaction buffer, merge state, listeners and counters clear            | Lifecycle/reset tests                        | Command closure contents cannot be introspected                                                 |
| Selection metadata              | PASS           | JSON-safe cloned entry metadata releases with entry                                   | Existing immutability test                   | Restoration application is later work                                                           |
| Dirty/saved state               | NOT_APPLICABLE | No history-position dirty/checkpoint mechanism exists                                 | Repository search                            | Future feature must model pruned boundaries                                                     |
| Document reset                  | PASS           | Identity-chain checks reject unrelated documents; no replacement API exists           | Document mismatch tests                      | Future replacement API must clear history                                                       |
| Determinism/performance/stress  | PASS           | No GC/heap/timing decisions; incremental counters                                     | Equivalent-engine and 10,000-operation tests | Very large explicit limits retain shift cost                                                    |
| Persistence/package boundaries  | PASS           | No schema changes; History depends only on Core                                       | Typecheck/build                              | None critical                                                                                   |
| Documentation                   | PASS           | README, phase guide, ADR                                                              | Format check                                 | None critical                                                                                   |
| Quality gates                   | PARTIAL        | Typecheck, tests, build and high-heap ESLint pass; scoped formatting passes           | 671 tests plus history benchmark             | Full format check finds pre-existing unformatted `AGENTS.md`; default-heap lint exhausts memory |

## Compatibility classification

- Count limit and undo-only semantics: **AS_IMPLEMENTED**.
- Oldest-first atomic pruning: **AS_IMPLEMENTED**, with statistics hardening.
- Merge/no-op and redo accounting: **HARDENING_REQUIRED**, now incremental.
- Estimated-cost retention: **COMPATIBLE_VARIATION**, opt-in and additive.
- Exact heap measurement and runtime reconfiguration: **FUTURE_MIGRATION**.
- Dirty-state checkpoints: **NOT_APPLICABLE** in the current Designer architecture.

History retains immutable before/after document references required by the snapshot-compatible
command model. No DOM nodes, renderers, UI instances, browser events, protocol clients, or stores
appear in its contracts or storage.
