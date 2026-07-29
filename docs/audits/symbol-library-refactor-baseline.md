# Symbol Library Refactor Baseline

Date: 2026-07-29

## Scope

This audit records the repository state before implementing the independent
Symbol Library refactor described by
`Symbol_Library_Refactor_Codex_Agent_Prompt.md`. The work is not a new numbered
project phase.

## Existing architecture

- `@web-scada/symbols` owns renderer-neutral symbol definitions, aliases,
  categories, packs, validation, and search.
- `@web-scada/renderer-svg` owns SVG DOM creation and a renderer registry.
- Designer and Symbol Gallery discover entries from the symbol registry.
- Runtime state and binding values reach renderers through the existing Runtime
  Engine and Binding Engine contracts.
- The shared animation scheduler remains the only animation clock.

The existing industrial catalog contains 42 canonical definitions across
process, instrumentation, electrical, BMS, safety, and network/control. All
existing canonical IDs, aliases, property keys, and port IDs are compatibility
inputs for this refactor.

## Baseline commands

| Command             | Result before changes                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `pnpm format:check` | Failed with 30 pre-existing formatting warnings.                                                           |
| `pnpm lint`         | Failed with 26 pre-existing errors in binding, core, and Modbus packages.                                  |
| `pnpm typecheck`    | Passed.                                                                                                    |
| `pnpm test`         | 497 tests passed; 3 OPC UA tests failed because the sandbox rejected `listen` on `127.0.0.1` with `EPERM`. |
| `pnpm build`        | Package compilation progressed, then failed because the installed Vite package lacked `vite/bin/vite.js`.  |

These failures are baseline constraints, not accepted completion results. The
final audit must rerun the full matrix and distinguish new regressions from
environment or pre-existing failures.

## Compatibility classification

| Existing implementation         | Action                                                                  |
| ------------------------------- | ----------------------------------------------------------------------- |
| Generic definition and registry | Extend additively.                                                      |
| Alias-aware lookup              | Preserve and harden.                                                    |
| 42 industrial definitions       | Preserve IDs and behavior; enrich metadata where safe.                  |
| SVG renderer registry           | Preserve public contract; add family-based visual packs.                |
| Designer palette                | Keep registry-driven; add category-aware discovery and defaults.        |
| Symbol Gallery                  | Keep real renderer previews; add filtering and variant controls.        |
| Document schema                 | Preserve; use deterministic alias migration without dropping node data. |

## Architectural constraints

- Generic symbol metadata must not import or expose SVG/DOM types.
- Runtime behavior must not mutate persisted `ScadaDocument` data.
- Symbols must not evaluate tags, alarms, or bindings independently.
- Symbols must not create per-instance timers or animation loops.
- New visuals must be vector implementations, not generic placeholder boxes.
- Catalog dispatch must be family-driven, not a central switch over every type.
