# Phase 11.03 — Command Merging and History Compression Audit

## Requirement traceability

| Requirement             | Status         | Evidence                                                     | Tests                                         | Remaining risk                                               |
| ----------------------- | -------------- | ------------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------ |
| Merge contracts         | PASS           | `HistoryMergeableCommand`, descriptor and policy             | `merge.test.ts`                               | Additive MINOR API                                           |
| Merge safety            | PASS           | descriptor, targets, group, continuity and `canMergeWith`    | incompatible target/property/group tests      | Caller capability must be truthful                           |
| Move merge              | PASS           | `MoveNodesCommand` canonical target set                      | Designer nudge and multi-selection tests      | Adjacent API calls are one sequence unless barrier supplied  |
| Resize merge            | PASS           | `ResizeNodeCommand` target descriptor                        | Designer resize undo/redo                     | Multi-selection resize uses opaque atomic command            |
| Rotation merge          | NOT_APPLICABLE | no rotation command implementation exists                    | repository audit                              | Future typed command can opt in                              |
| Property merge          | PARTIAL        | public explicit capability supports same-property strategy   | deterministic rename property test            | `UpdateNodeCommand` callback cannot reveal property identity |
| Merge barriers          | PASS           | explicit API plus undo/redo/clear/transaction/selection/tool | barrier tests and Designer target-change test | No document replacement API exists                           |
| Transaction integration | PASS           | tail compression before atomic commit                        | commit/cancel/mixed legacy tests              | Existing nested rejection retained                           |
| Undo correctness        | PASS           | compact earliest snapshot                                    | unit and real Designer tests                  | Command side effects remain unsupported                      |
| Redo correctness        | PASS           | compact latest snapshot                                      | unit and real Designer tests                  | None                                                         |
| Compression             | PASS           | O(1) automatic adjacent compression                          | depth and equivalence tests                   | No explicit O(n) compact API needed                          |
| No-op handling          | PASS           | optional domain equality, configurable                       | enabled/disabled tests                        | Only proven command families qualify                         |
| Determinism             | PASS           | sequence IDs and explicit timestamp inputs                   | fixed timestamp tests                         | System clock only affects optional window                    |
| Immutability            | PASS           | frozen descriptors, operations, entries and statistics       | existing metadata tests and typecheck         | Commands remain caller-owned                                 |
| Error isolation         | PASS           | separate fallback and typed warning                          | thrown compatibility test                     | Change derivation adapter must be pure                       |
| Performance             | PASS           | latest-tail comparison                                       | 10,000-candidate diagnostic                   | Benchmark has no flaky threshold                             |
| Memory cleanup          | PASS           | compact snapshot and existing disposal/cancel clearing       | disposal/cancel regression                    | Entry limit remains count-based                              |
| Documentation           | PASS           | README, architecture doc, ADR, phase roadmap                 | scoped format check                           | None                                                         |
| Quality gates           | PASS           | lint, typecheck, build, scoped format and benchmark passed   | command evidence below                        | Global format retains pre-existing `AGENTS.md` exception     |
| Regression tests        | PASS           | baseline 43 and final focused 56 tests passed                | full suite 661/661 outside sandbox            | None                                                         |

## Compatibility classification

- `AS_IMPLEMENTED`: Phase 11.00–11.02 stacks, transactions, events, limits, and Designer adapter are
  reused in place.
- `HARDENING_REQUIRED`: merge metadata previously existed but was not interpreted; it is now enforced.
- `COMPATIBLE_VARIATION`: command-owned compatibility plus History-owned orchestration avoids a
  strategy registry.
- `FUTURE_MIGRATION`: typed property and rotation commands may opt in later without persisted changes.
- `ARCHITECTURAL_BLOCKER`: none.

## Quality-gate evidence

- `NODE_OPTIONS=--max-old-space-size=4096 pnpm lint`: PASS.
- `pnpm typecheck`: PASS across all workspace packages and applications.
- `pnpm build`: PASS across all packages and applications.
- focused History/Designer suite: PASS, 56 tests across five files.
- `pnpm test` outside the network sandbox: PASS, 111 files and 661 tests. The sandboxed invocation
  reached 658 passes and only the three expected OPC UA localhost tests failed with
  `listen EPERM: operation not permitted 127.0.0.1`.
- History diagnostic benchmark: PASS; Node 18.20.8 merged 9,999 of 10,000 candidates into one entry
  in approximately 272.64 ms. This is observational and has no unstable timing assertion.
- scoped Prettier for every Phase 11.03 file: PASS.
- global `pnpm format:check`: PARTIAL only because the pre-existing untracked `AGENTS.md` is not
  formatted.
- Playwright: NOT_APPLICABLE; no browser-facing command path or demo UI was changed.
- `api:check`: NOT_APPLICABLE; the repository has no such script.
