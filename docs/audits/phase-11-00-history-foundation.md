# Phase 11.00 — History Foundation Audit

## Objective and baseline

Establish a dedicated, typed history owner without replacing Core commands or
changing persisted document schema. Before implementation, `format:check`
failed only for the pre-existing untracked `AGENTS.md`; repository lint exhausted
Node's default heap. Existing Phase 10 user changes were preserved.

## Repository findings and compatibility classification

| Area                         | Classification       | Decision                                                                  |
| ---------------------------- | -------------------- | ------------------------------------------------------------------------- |
| Core `Command` reversibility | AS_IMPLEMENTED       | Reuse execute/undo/redo and `canMergeWith`                                |
| Core `CommandResult`         | COMPATIBLE_VARIATION | Keep document-only result; entry optionally carries existing change set   |
| `DocumentChangeSet`          | AS_IMPLEMENTED       | Import public Core contract; do not duplicate                             |
| Designer snapshot history    | HARDENING_REQUIRED   | Preserve `CommandHistory` as adapter; move ownership to dedicated package |
| Designer state/sessions      | AS_IMPLEMENTED       | Selection/clipboard/preview stay in Designer                              |
| Clipboard/keyboard           | FUTURE_MIGRATION     | Existing higher-level routing remains; no browser APIs in History         |

No architectural blocker required a Core contract or schema change. Public API
addition is classified **MINOR**; the Designer compatibility surface is
preserved.

## Requirement traceability and final audit

| Requirement                  | Status  | Evidence                                          | Tests                                           | Action                                   | Remaining risk                                                     |
| ---------------------------- | ------- | ------------------------------------------------- | ----------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------ |
| Package ownership            | PASS    | `packages/history-engine`                         | construction                                    | Dedicated state owner                    | None                                                               |
| Dependency boundaries        | PASS    | package manifest: Core only                       | package build                                   | No UI/DOM/renderer/runtime import        | Static checks remain conventional                                  |
| Core command reuse           | PASS    | `HistoryOperation.command`                        | execute/undo/redo tests and Designer regression | Existing contract retained               | Full failure atomicity hardening deferred                          |
| Change-set reuse             | PASS    | optional Core `DocumentChangeSet`                 | package compilation                             | No duplicate type                        | Designer derives changes after execution today                     |
| Immutable boundaries         | PASS    | frozen state/entries/deep restoration copies      | immutable state/options/metadata tests          | Caller inputs not mutated                | Commands/documents follow existing readonly-by-contract convention |
| Deterministic ordering       | PASS    | sequence-based `history-N`                        | sequence/limit test                             | No clock ordering                        | IDs are instance-local by design                                   |
| State encapsulation          | PASS    | readonly depth snapshot, private stacks           | state tests                                     | No arrays exported                       | None                                                               |
| Reversibility contract       | PASS    | Core `Command` required                           | round-trip Designer tests                       | Non-command entries impossible           | Non-reversible Core command variant does not exist                 |
| Transaction foundation       | PASS    | explicit handle; nesting rejected                 | commit/cancel/invalid tests                     | Atomic logical entry                     | Rollback of already-applied documents belongs to composition layer |
| Merge/compression foundation | PASS    | merge metadata and README constraints             | metadata compilation                            | No speculative algorithm                 | Later subphase                                                     |
| Limit semantics              | PASS    | default 100; undo logical entries; zero supported | invalid/overflow/zero tests                     | Oldest entries evicted                   | Memory sizing is entry-count based                                 |
| Lifecycle/disposal           | PASS    | idempotent dispose and typed rejection            | lifecycle tests                                 | Designer delegates dispose               | None                                                               |
| Restoration boundary         | PASS    | JSON-safe neutral metadata                        | contract compilation                            | Designer retains ownership               | Behavior deferred                                                  |
| Clipboard boundary           | PASS    | README integration flow                           | Designer regression tests                       | Commands remain insertion boundary       | Validation/remapping later                                         |
| Keyboard boundary            | PASS    | README; existing Designer tools                   | existing Designer tests                         | No listeners added                       | Complete shortcuts later                                           |
| Renderer independence        | PASS    | manifest and source imports                       | package build                                   | Renderer sees documents/change sets only | None                                                               |
| Runtime isolation            | PASS    | manifest and docs                                 | package build                                   | No runtime dependency                    | None                                                               |
| Error model                  | PASS    | `HistoryError` diagnostic/code                    | invalid operation tests                         | No raw string throws                     | Central taxonomy has no history category                           |
| Events/subscriptions         | PASS    | readonly events and unsubscribe handle            | listener disposal test                          | Framework-neutral synchronous delivery   | Listener exceptions currently propagate                            |
| Long interaction seam        | PASS    | Designer drag adapter commits one command         | `drag-adapter.test.ts`                          | Pointer previews excluded                | Broader gesture coverage later                                     |
| Public exports               | PASS    | package `exports` and index barrel                | package build                                   | Intentional surface only                 | API extraction tooling absent                                      |
| Serialization policy         | PASS    | README                                            | document regression suite                       | No schema change                         | Persistent history not supported                                   |
| Documentation                | PASS    | package README, architecture, phase, this audit   | format check                                    | Boundaries/deferred work explicit        | None                                                               |
| Compatibility impact         | PASS    | deprecated adapter preserves name/API             | Designer tests                                  | No serialized/API removal                | Default retention changes old unbounded memory behavior            |
| Quality gates                | PARTIAL | final command evidence below                      | focused and repository gates                    | Record actual outcomes                   | Pre-existing formatting and resource limits                        |

## Deferred work and readiness

Production failure-atomic undo/redo, merge strategies, compression, restoration
application, clipboard remapping, templates, and keyboard UX are deliberately
deferred. The public sequencing, transaction, metadata, lifecycle, and
observation seams are ready for Phase 11.01 without coupling History to UI.

## Quality-gate evidence

- `pnpm typecheck`: PASS (23 workspace projects; History package included).
- `pnpm test`: PASS outside the network sandbox, 110 files and 630 tests. The
  sandboxed run had 627 pass and three OPC UA localhost-bind `EPERM` failures.
- `pnpm build`: PASS (all package and application builds).
- `NODE_OPTIONS=--max-old-space-size=4096 pnpm lint`: PASS. The default-heap
  baseline invocation exhausted Node memory before implementation.
- `pnpm format:check`: PARTIAL because the pre-existing untracked `AGENTS.md`
  is not formatted. A scoped Prettier check covering every Phase 11.00 file
  passed.
- Focused regression: PASS, 25 tests across History, Designer, Phase 5, and the
  drag integration seam.
- Playwright: NOT_APPLICABLE; no browser-facing UI was changed.
- `docs:build` and `api:check`: NOT_APPLICABLE; repository scripts do not exist.
