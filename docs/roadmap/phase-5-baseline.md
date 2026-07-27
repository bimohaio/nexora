# Phase 5 Baseline

Recorded 2026-07-26 before Phase 5 source changes on Node 18+ and pnpm 9.15.9.

| Command             | Result | Evidence                                        |
| ------------------- | ------ | ----------------------------------------------- |
| `pnpm format:check` | PASS   | Prettier reported all files matched.            |
| `pnpm lint`         | PASS   | ESLint exited 0.                                |
| `pnpm typecheck`    | PASS   | All package and application typechecks passed.  |
| `pnpm test`         | PASS   | 14 files and 66 tests passed.                   |
| `pnpm build`        | PASS   | All packages and three Vite applications built. |

No pre-existing failure or warning affected implementation. There is no
benchmark, documentation-build, or API-extractor script in the repository.

See also:

- [Phase 4 compatibility](phase-5-phase-4-compatibility.md)
- [Phase 5 specification](../phases/phase-05-editing.md)
- [Testing strategy](../master-spec/testing-strategy.md)
