# Symbol Library Refactor Final Audit

Date: 2026-07-29

## Result

The standard registry now contains 428 canonical definitions: 8 foundation
symbols, 42 preserved industrial symbols, and all 378 entries explicitly
listed in Section 17 of the refactor prompt. The enumerated list totals 378,
despite being described informally as nearly 400.

All 17 required categories are registered with stable IDs, ordering, names,
and search tags. Category counts and the contributor contract are documented
in `docs/architecture/composite-symbol-library.md`.

## Architecture and compatibility

- Generic definitions now support aspect policy, variants, anchors, expanded
  normalized states, explicit capabilities, and richer property metadata.
- Definitions and their metadata collections are frozen on registration.
- Validation covers IDs, categories, dimensions, defaults, variants, anchors,
  ports, states, capabilities, aliases, and deprecations.
- The existing 42 industrial IDs, aliases, properties, ports, visuals, and
  packs remain registered and tested.
- Alias canonicalization is immutable and idempotent. It preserves node IDs,
  transforms, properties, bindings, extensions, ordering, and connections.
- Unknown types remain unchanged for safe fallback rendering.
- No document schema change was required.

SVG visuals remain in `@web-scada/renderer-svg`. Seventeen semantic family
drawers provide original vector geometry and kind-specific details. Every
catalog type has an explicit visual registration without a switch over hundreds
of type IDs. No raster, external asset, protocol reader, binding evaluator,
alarm evaluator, private animation loop, or renderer type entered the generic
package.

## Designer, Runtime, and gallery

- Designer palette discovery uses registry search and category metadata,
  exposes the full catalog, applies defaults, and supports variant editing.
- Runtime and Binding Engine accept the expanded normalized state set through
  the existing visual-state pipeline.
- Families declare runtime properties including enabled, open percentage,
  speed, flow, level, value, unit, and text where relevant.
- Motion symbols use only the existing shared animation infrastructure.
- Alarm visuals continue through the existing alarm/state pipeline.
- Gallery uses production renderers and supports category, search, theme,
  state, variant, rotation, size, and port previews. Native browsers lazy-mount
  previews; non-browser environments use a deterministic eager fallback.

## Test and command evidence

New direct coverage:

- `packages/symbols/src/composite-catalog.test.ts`
- `packages/renderer-svg/src/composite-symbol-renderers.test.ts`

The catalog suite verifies 378 unique entries, 17 categories, 428 total
definitions, immutability, registry validity, variants, anchors, dimensions,
ports, and lossless alias canonicalization. The renderer suite registers,
creates, renders, and disposes all 378 composite visuals.

| Command                                          | Result                                                                                                          |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `pnpm install --force`                           | Passed; restored the incomplete local Vite installation.                                                        |
| `pnpm typecheck`                                 | Passed for all packages and apps.                                                                               |
| Targeted ESLint on every changed TypeScript file | Passed.                                                                                                         |
| Targeted Prettier check on every changed file    | Passed.                                                                                                         |
| `pnpm test` with local socket permission         | Passed: 82 files, 505 tests.                                                                                    |
| `pnpm build`                                     | Passed, including all three production apps.                                                                    |
| `pnpm lint`                                      | Fails with the same 26 inherited errors from baseline: 1 animation and 25 Modbus errors. No changed file fails. |
| `pnpm format:check`                              | Fails on `AGENTS.md` and five inherited alarm/animation files. No changed task file fails.                      |

The initial sandbox-only OPC UA `listen EPERM` failures were rerun with local
socket permission and all three passed.

## Performance and lifecycle

- Registry construction and validation covers 428 definitions.
- All 378 new renderers create and dispose in direct tests.
- The full 428-entry gallery integration test completes in about one second in
  the test DOM.
- Existing 500-node renderer and Runtime performance fixtures pass.
- Static catalog entries create no scheduler work.
- Gallery teardown disposes activated renderers and disconnects its observer.

## Known inherited limitations

Repository-wide lint and format cannot be marked green because of the
pre-existing unrelated files listed above. They were not modified because
doing so would expand the refactor's risk. Typechecks, tests, builds, and all
task-scoped lint/format gates are green.

Display symbols integrate with current generic binding/state contracts.
Historical-trend storage, alarm-list querying, recipe execution, and navigation
routing remain responsibilities of application/widget services rather than
being duplicated inside symbols.
