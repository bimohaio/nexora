# Phase 10.05 alarm runtime traceability

| Requirement                         | Implementation                                                 | Test evidence                               |
| ----------------------------------- | -------------------------------------------------------------- | ------------------------------------------- |
| Immutable runtime model             | `alarm/types.ts`, frozen transition outputs and snapshot views | lifecycle and registry tests                |
| Deterministic severity and priority | `severity-resolver.ts`, total `alarmId` tie-break              | ordering and randomized tests               |
| Lifecycle and acknowledgement       | `alarm-state.ts`                                               | active/ack/returned/normal test             |
| Suppression and quality             | status eligibility and quality-bearing model                   | parameterized suppression/offline tests     |
| Multi-scope aggregation             | indexed aggregation in `RuntimeAlarmEngine`                    | symbol/connection/group/layer/document test |
| Snapshot and incremental diff       | `AlarmSnapshot`, `AlarmSnapshotDiff`                           | scheduler/diff and 10,000-alarm tests       |
| Renderer-neutral visual state       | `aggregation.ts`, `composeAlarmVisualSnapshot`                 | composition test                            |
| Shared scheduling                   | injected `RuntimeTaskScheduler`, one coalesced task            | manual scheduler test                       |
| Runtime events                      | typed `AlarmEvent` and `onEvent` boundary                      | lifecycle event test                        |
| No persisted document mutation      | alarm package has no document write path                       | architecture audit and docs                 |
| Public API and docs                 | root export and four `docs/runtime` documents                  | package typecheck                           |

## Validation evidence

- `pnpm test`: 573 passed; the three OPC UA local-listener tests were blocked by sandbox `EPERM`.
- `pnpm exec vitest run packages/datasource-opcua/src/adapter.test.ts` outside the network sandbox:
  3 passed.
- `pnpm typecheck`: passed for all packages and applications.
- `pnpm build`: passed for all packages and all three Vite applications.
- Scoped ESLint for every Phase 10.05 source file and touched Runtime contract: passed.
- `pnpm lint`: repository-wide gate remains blocked by 76 pre-existing errors outside the Phase
  10.05 files. No Phase 10.05 file appears in that failure list.
- `git diff --check`: passed.

Because the repository-wide lint gate is not green, this audit does not claim every global
acceptance gate passed. The Phase 10.05 implementation itself is lint-clean.
