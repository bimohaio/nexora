# Phase 10.10 Browser Demo and Authoring Support

| Requirement                                 | Implementation                                                           | Evidence                       |
| ------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------ |
| Five industrial sample documents            | runtime demo scenario catalog                                            | catalog unit and browser tests |
| Designer/Runtime switching                  | existing revisioned postMessage handoff                                  | Playwright handoff test        |
| Live values, bindings, alarms and animation | existing runtime demo engines and Phase 10 controls                      | runtime Playwright tests       |
| Reduced motion, theme, viewport controls    | existing global controls and presentation preview                        | browser tests                  |
| Runtime control surface                     | warning/critical/ack/offline/flow/speed controls                         | provider and browser tests     |
| Performance diagnostics                     | `BrowserDemoDiagnostics`                                                 | diagnostics unit/browser tests |
| Animation/alarm authoring preview           | Designer Phase 10 authoring panel                                        | authoring unit/browser tests   |
| Incremental updates and cleanup             | existing renderer pipeline plus explicit disposal                        | regression and browser tests   |
| 100–5,000 entity support                    | existing runtime/visibility scaling tests and Phase 10.09 collector test | performance suite              |
| Documentation                               | browser, authoring and testing guides                                    | documentation audit            |

Phase 10.10 adds demo-only configuration and does not change persisted schema contracts.

## Verification evidence

- `NODE_OPTIONS=--max-old-space-size=4096 pnpm lint`: passed.
- Targeted Prettier check for every Phase 10.09–10.10 changed file: passed.
- `pnpm typecheck`: passed.
- `pnpm build`: passed.
- `pnpm test`: 109 test files and 619 tests passed; the OPC UA tests were run
  with localhost socket permission.
- `pnpm test:e2e`: 21 browser tests passed.
- `git diff --check`: passed before staging.

The repository-wide `pnpm format:check` remains blocked by eight pre-existing
files outside this batch. All files included in this phase batch pass Prettier.
