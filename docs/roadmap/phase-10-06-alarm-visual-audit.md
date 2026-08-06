# Phase 10.06 alarm visual traceability

| Requirement                          | Evidence                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| Renderer-neutral immutable contracts | `runtime-engine/src/alarm-visual/types.ts`                                       |
| Single pure presentation authority   | `AlarmVisualResolver` and pure resolver functions                                |
| Badge/overlay/border/fill/text/icon  | `alarm-visual-resolver.ts` unit coverage                                         |
| Semantic themes                      | `theme.ts`, theme alias and no-hardcoded-color tests                             |
| Reduced motion                       | static fallback test; no timer ownership                                         |
| Animation integration                | blink/flash/pulse/glow requests only; renderer executes them on shared scheduler |
| Incremental updates                  | `AlarmVisualPresentationStore`, identity and targeted-diff tests                 |
| All presentation scopes              | symbol/connection/group/layer/document snapshot maps                             |
| Offline/disabled priority            | presentation status override tests and snapshot status projection                |
| 10,000 alarms / 5,000 symbols        | large deterministic projection test                                              |
| Runtime demo                         | state, theme and reduced-motion controls render resolved contracts only          |
| Documentation                        | five Phase 10.06 runtime documents                                               |

## Validation evidence

- Phase 10.05/10.06 scoped suites: 37 passed.
- `pnpm test`: 586 passed in sandbox; three OPC UA local-listener tests were blocked by `EPERM`.
- OPC UA adapter suite outside sandbox: 3 passed.
- `pnpm typecheck`: passed across all packages and applications.
- `pnpm build`: passed across all packages and three Vite applications.
- `pnpm test:e2e` outside sandbox: 19 passed, including the Phase 10.06 demo and Phase 10.03
  regression.
- Scoped ESLint for Phase 10.06 Runtime source and runtime-demo main: passed.
- `pnpm lint`: still blocked by the same 76 pre-existing errors outside Phase 10.05/10.06 files.

The implementation gates are green. The repository-wide lint acceptance gate cannot be claimed
until the separately identified pre-existing lint debt is resolved.
