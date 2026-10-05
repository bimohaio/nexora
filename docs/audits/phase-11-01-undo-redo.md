# Phase 11.01 — Undo / Redo Engine Audit

## Repository findings and compatibility

Phase 11.00 already established `@web-scada/history-engine`, private linear
stacks, immutable entries/state, retention, subscriptions, disposal, and the
Core `Command.execute/undo/redo` protocol. The implementation is classified
**HARDENING_REQUIRED** for production failure atomicity and typed execution
results. Core's document-only `CommandResult` is a **COMPATIBLE_VARIATION**;
Designer injects its existing neutral change-set derivation adapter. No command,
document schema, renderer, runtime, or selection contract was replaced.

## Requirement traceability

| Requirement                | Status         | Evidence                                   | Tests                               | Action                              | Remaining risk                                        |
| -------------------------- | -------------- | ------------------------------------------ | ----------------------------------- | ----------------------------------- | ----------------------------------------------------- |
| Phase 11.00 reuse          | PASS           | `history-engine/src/engine.ts`             | foundation regressions              | Extended existing engine            | None                                                  |
| Command architecture       | PASS           | Core `Command` calls only                  | real Designer move/resize           | No direct mutation                  | Snapshot commands retain documents                    |
| Undo/redo correctness      | PASS           | `executeUndo/executeRedo`                  | multi-step and Designer round trips | Reverse/original order              | None                                                  |
| Stack order/divergence     | PASS           | private stack transitions                  | ordering; divergent record          | Linear history                      | None                                                  |
| Failure atomicity          | PASS           | execute-before-transition                  | undo/redo throw tests               | Preserve stacks/revision            | Caller-owned command side effects are outside History |
| Empty operations           | PASS           | typed `not-available`                      | empty result test                   | No event/revision                   | None                                                  |
| Document identity          | PASS           | recorded head identity guard               | mismatch test                       | Typed diagnostic                    | Deliberately identity-based                           |
| Non-reversible entries     | NOT_APPLICABLE | Core `Command` requires undo/redo          | Typecheck                           | Cannot record via typed API         | Untyped callers can still violate contracts           |
| Change sets                | PASS           | `deriveChanges`, frozen entry data         | propagation and renderer assertion  | Return forward/inverse sets         | Generic owners must supply adapter                    |
| Diagnostics                | PASS           | typed execution diagnostics                | failure/mismatch tests              | Preserve operation category         | Core commands expose no diagnostics today             |
| Limits                     | PASS           | existing eviction                          | full limited round trip             | Evicted entries stay absent         | Entry-count limit only                                |
| Revision/state             | PASS           | atomic transition                          | failure and no-op assertions        | Derived flags/depth                 | None                                                  |
| Events/subscriptions       | PASS           | `undone`/`redone`                          | event/unsubscribe test              | Publish committed state             | Listener exceptions follow existing sync policy       |
| Lifecycle                  | PASS           | existing typed disposal                    | disposal regression                 | No resurrection                     | None                                                  |
| Immutability               | PASS           | frozen results/change sets/state           | metadata/state tests                | Clone public arrays                 | Commands remain Core-owned                            |
| Designer integration       | PASS           | injected derivation and result consumption | Designer renderer test              | Forward returned changes            | Selection restoration deferred                        |
| Renderer/runtime isolation | PASS           | History depends only on Core               | package build                       | No DOM/framework/runtime imports    | None                                                  |
| Public exports             | PASS           | barrel exports contracts/engine            | package build                       | Additive API                        | API extraction script absent                          |
| Documentation              | PASS           | package README and this audit              | Prettier scoped check               | Semantics/diagram/limits documented | None                                                  |
| Transactions boundary      | PASS           | foundation unchanged                       | transaction regressions             | No Phase 11.02 behavior added       | Production transaction composition deferred           |
| Quality gates              | PARTIAL        | command evidence below                     | focused/full suite                  | Record actual environment results   | Sandbox and pre-existing formatting issue             |

## Quality-gate evidence

Baseline before Phase 11.01 changes:

- `pnpm typecheck`: PASS.
- `pnpm build`: PASS.
- `pnpm test`: 627/630 PASS; three OPC UA tests failed because the sandbox
  rejects localhost `listen` with `EPERM`.
- `pnpm format:check`: only the pre-existing untracked `AGENTS.md` failed.
- `pnpm lint`: Node exhausted the default heap.

Final evidence after Phase 11.01 implementation:

- `NODE_OPTIONS=--max-old-space-size=4096 pnpm lint`: PASS.
- `pnpm typecheck`: PASS across all workspace packages/apps.
- `pnpm test` outside the network sandbox: PASS, 110 files and 636 tests.
- `pnpm build`: PASS across all packages and applications.
- Focused History/Designer regression: PASS, 31 tests across four files.
- Scoped Prettier check for every changed Phase 11.01 file: PASS.
- Global `pnpm format:check`: PARTIAL only because the pre-existing untracked
  `AGENTS.md` is not formatted.
- `git diff --check`: PASS.
- Playwright: NOT_APPLICABLE; no browser UI or keyboard routing changed.
- `docs:build` and `api:check`: NOT_APPLICABLE; these scripts do not exist.

## Deferred work and Phase 11.02 readiness

Nested/advanced transactions, merging, clipboard, keyboard UX, and selection
restoration are intentionally deferred. The stable entry representation,
deterministic replay order, identity guard, and proven failure-atomic stack
transition provide the required seam for Phase 11.02.
