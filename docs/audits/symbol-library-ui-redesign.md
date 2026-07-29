# Symbol Library UI Redesign Audit

Date: 2026-07-29

## Scope

This is a Designer UI/UX refactor only. Symbol IDs, definitions, document
schema, renderer geometry/output, ports, anchors, bindings, states, animations,
Runtime behavior, and serialization contracts are unchanged.

## Implementation

The narrow Symbols sidebar now provides:

- a sticky compact header and registered-symbol total;
- ranked, case-insensitive search across display name, type ID, category,
  aliases, and tags;
- clear-search button and Escape-to-clear behavior;
- a custom category menu with live counts and clear All Categories option;
- accurate result count and deterministic default/name sorting;
- persisted responsive grid and dense list modes;
- versioned, validated local-storage preferences with safe failure fallback;
- favorites and a bounded, deduplicated recent-symbol list;
- collapsible category sections with eight-item initial batches and View All;
- production SVG previews with native `IntersectionObserver` lazy mounting,
  deterministic non-browser fallback, renderer disposal, and preview-error
  fallback;
- accessible favorite, view, category, collapse, search, result, and empty
  states;
- click insertion and HTML5 drag/drop insertion using the same Designer
  `insertNode` command boundary;
- a validated `application/x-web-scada-symbol-type` drag payload;
- lossless default sizes, default properties, type IDs, and undo/redo history.

Grid cards use a compact two-column layout in the current 240px sidebar. CSS
auto-fill adds columns if the panel becomes wider and falls back to one column
when needed. List mode prioritizes readable names, IDs, and category metadata.
Long IDs are truncated without widening the panel.

## State ownership

Search, active category, category expansion, and batch expansion remain local
panel state. View, sort, favorites, and recent IDs are editor preferences under
the versioned `nexora.symbol-library.v1` key. Persisted arrays accept only
currently registered symbol IDs. No preference enters `ScadaDocument`.

## Performance

Registry definitions and category metadata are normalized once. Search values
and category metadata are cached in the normalized presentation model.
Filtering and deterministic sorting operate on the cached 428-item array.

All-category browsing initially renders at most eight cards per expanded
category. Native browser previews mount only near the scroll viewport. Each
filter/view rerender disconnects the old observer and disposes mounted visual
elements before replacing DOM.

Manual browser verification at 1440×900 confirmed the production sidebar
layout, two-column grid, real previews, sticky controls, and absence of
horizontal overflow. The focused E2E workflow covering search, favorites,
preference reload, click insertion, drag insertion, undo, and redo completes in
under one second on the development machine.

## Tests

- `apps/designer-demo/src/symbol-library.test.ts` covers normalization,
  fallback labels/categories, ranked search, combined category filtering,
  sorting, favorite ordering, favorite toggling, recent bounds/deduplication,
  corrupt/obsolete preference recovery, and drag payload validation.
- `tests/integration/designer-demo.e2e.ts` covers the real panel with the
  complete registry, preference persistence, non-inserting favorite actions,
  click insertion, drag/drop, and undo/redo.
- Existing Designer selection, binding, advanced editing, accessibility, and
  interaction-performance E2E scenarios remain enabled.

## Validation results

| Command                    | Result                                                                 |
| -------------------------- | ---------------------------------------------------------------------- |
| `pnpm typecheck`           | Passed for the complete workspace.                                     |
| `pnpm build`               | Passed for all packages and all three production demos.                |
| `pnpm test`                | Passed: 83 files, 511 tests, including OPC UA local-server coverage.   |
| `pnpm test:e2e`            | Passed: 17 browser tests across Designer, Runtime, and Symbol Gallery. |
| Task-scoped ESLint         | Passed for all changed TypeScript and E2E files.                       |
| Task-scoped Prettier check | Passed for all changed implementation, test, and documentation files.  |
| `git diff --check`         | Passed.                                                                |

Repository-wide `pnpm lint` retains the same 26 pre-existing Animation/Modbus
errors recorded by the Symbol Library baseline. Repository-wide
`pnpm format:check` retains six pre-existing formatting warnings in
`AGENTS.md` and unrelated Alarm/Animation files. No file changed by this UI
redesign contributes to either inherited failure.

## Deferred optional items

An expanded modal/library window was not introduced because the application
does not currently have a resizable panel or shared windowing contract. The
responsive sidebar already scales if its parent width changes, and introducing
a global window system would exceed this UI-only scope.

Category-name search is supported through the main symbol search. A second
search field inside the compact category menu was omitted because 22 populated
categories remain directly scannable and the extra control reduced narrow-mode
clarity.

## Risks

User preferences intentionally remain browser-local. When local storage is
unavailable, full functionality remains available for the session but view,
favorite, sort, and recent preferences do not survive reload.
