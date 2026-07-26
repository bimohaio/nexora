# Phase 2 hardening audit

Audit date: 2026-07-26.

## Baseline

Requirement: Run repository gates before changes.  
Status: PASS  
Evidence: Clean Git worktree; root `package.json` scripts.  
Tests: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and
`pnpm build` passed; 46 Vitest tests passed. `pnpm test:e2e` initially failed
because the sandbox denied local port 4173, then passed outside that restriction
with 2 tests.  
Action taken: Recorded results before edits.  
Remaining risk: None.

## Phase 1 boundary

Requirement: Reuse Phase 1 contracts without duplication.  
Status: PASS  
Evidence: `renderer-svg/src/contracts.ts`, `core/src/model.ts`,
`core/src/change-set.ts`, `geometry/src/geometry.ts`, `symbols/src/symbol.ts`.  
Tests: Workspace typecheck and Phase 1 integration tests.  
Action taken: Removed public `RenderChangeSet`; renderer now consumes
`DocumentChangeSet`. Added `phase-1-renderer-boundary.md`.  
Remaining risk: This is a breaking removal for pre-release consumers; migrate
`createEmptyRenderChangeSet()` to core `createEmptyChangeSet()` and call
`setViewport()` separately.

## Parsing and validation

Requirement: Consume validated documents and own no import pipeline.  
Status: PASS  
Evidence: No parsing, migration, normalization, or semantic validation imports in
`packages/renderer-svg`; core owns them. Runtime demo uses a typed fixture.  
Tests: `phase-1-flow.test.ts`, `phase-2-document.test.ts`.  
Action taken: Documented the boundary and future JSON-import rule.  
Remaining risk: The renderer relies on its caller honoring the contract.

## Change sets and invalidation

Requirement: Use `DocumentChangeSet` and expand renderer dependencies.  
Status: PASS  
Evidence: `renderer.ts` refreshes ports and attached connections, clears removals,
reconciles ordering, and rebuilds canvas definitions when needed.  
Tests: `renderer-dom.test.ts` stable identity, endpoint update, removal, and layer
cleanup tests.  
Action taken: Fixed removed-node connection invalidation, layer map cleanup, canvas
definition refresh, and deterministic incremental ordering.  
Remaining risk: Incorrect caller-produced change sets can still omit unrelated
entity changes.

## Symbols

Requirement: Keep metadata DOM-free and visuals SVG-specific.  
Status: PASS  
Evidence: `symbols/src/symbol.ts` has metadata only;
`renderer-svg/src/symbol-renderers.ts` owns DOM visuals and registry lookup.  
Tests: Symbol tests and renderer fallback integration test.  
Action taken: Added distinct typed metadata-missing and visual-missing warnings.  
Remaining risk: Fallback cannot infer ports when metadata is absent.

## Geometry and node-local coordinates

Requirement: Match Phase 1 center-based transform and port semantics.  
Status: PASS  
Evidence: `calculatePortPosition` is reused; visual adapters draw from local `(0,0)`
using node width and height.  
Tests: Geometry tests plus scaled/rotated DOM conformance and connection endpoint
assertions in `renderer-dom.test.ts`.  
Action taken: Fixed SVG scaling to occur around the documented node center.  
Remaining risk: Negative scale is supported by geometry but not exercised in DOM
tests.

## Scene graph

Requirement: Avoid unnecessary domain duplication.  
Status: NOT APPLICABLE  
Evidence: `NativeSvgRenderer` directly translates document snapshots through small
pure calculation and symbol-adapter modules.  
Tests: Renderer unit and DOM integration suites.  
Action taken: No scene graph added.  
Remaining risk: Revisit only if a second renderer backend needs shared primitives.

## Lifecycle and resource ownership

Requirement: Safe mount, render, unmount, dispose, and use-after-dispose behavior.  
Status: PASS  
Evidence: `renderer.ts` removes SVG/listeners, cancels frames, clears maps and
references, and permanently marks disposal.  
Tests: Lifecycle/disposal and scheduled-frame DOM tests.  
Action taken: Also clear stale debug elements on node removal.  
Remaining risk: `ResizeObserver` is application-owned and must be disconnected by
the application, as the demo does.

## Stable DOM identity and maps

Requirement: Preserve unrelated objects and maintain entity maps.  
Status: PASS  
Evidence: Maps cover layers, nodes, connections, hit paths, and ports; updates use
those maps.  
Tests: Exact identity assertions for unrelated nodes, connections, layers, and
viewport-preserved definitions.  
Action taken: Incremental order reconciliation moves existing objects rather than
recreating them.  
Remaining risk: Updated node ports are intentionally rebuilt.

## SVG definitions and multiple instances

Requirement: Cache instance-scoped, collision-safe definitions.  
Status: PASS  
Evidence: Per-instance generated prefix owns grid and marker IDs; definitions are
inside each SVG root.  
Tests: Two-renderer pattern-ID test and viewport identity assertion.  
Action taken: Canvas changes now refresh grid definitions as well as the grid.  
Remaining risk: Definitions are rebuilt by option/canvas changes, not deduplicated
across renderer instances by design.

## Layers and z-order

Requirement: Deterministic layer and entity order, visibility, and lock metadata.  
Status: PASS  
Evidence: Each sorted layer contains connections, nodes, then ports; overlay and
debug groups remain above the scene.  
Tests: Hierarchy, hidden-layer, lock, identity, and layer-removal tests.  
Action taken: Added incremental entity-order reconciliation and stale-map cleanup.  
Remaining risk: Locking disables renderer pointer events; editing policy remains an
interaction-layer concern.

## Connections

Requirement: Direct, manual, and deterministic orthogonal routing with safe failure.  
Status: PASS  
Evidence: Pure routing functions, visual and hit paths, styles, markers, and
endpoint metadata in renderer files.  
Tests: Pure route tests and DOM endpoint/removal tests.  
Action taken: Attached connections now invalidate for removed nodes.  
Remaining risk: Orthogonal routing uses a midpoint and deliberately has no obstacle
avoidance; unresolved endpoints render an empty path and warning.

## Ports

Requirement: Resolve generic metadata and apply normalized transformed positions.  
Status: PASS  
Evidence: `calculatePortPosition`, metadata direction/medium attributes, stable
`nodeId::portId` keys, and deterministic visibility options.  
Tests: Geometry tests and rotated/scaled DOM conformance test.  
Action taken: Added end-to-end port/connection geometry assertions.  
Remaining risk: Hover mode is delegated and has limited keyboard behavior.

## Viewport and resize

Requirement: Keep viewport authority outside the document renderer and resize owned
SVG dimensions.  
Status: PASS  
Evidence: Public `setViewport`, pure viewport math, demo-owned pan controller and
`ResizeObserver`.  
Tests: Viewport/fit/resize DOM tests and Playwright pan/resize tests.  
Action taken: Removed viewport flags from document change sets.  
Remaining risk: The renderer caches the applied viewport as required for drawing.

## Runtime state

Requirement: Accept resolved visual state and avoid protocol/binding ownership.  
Status: PASS  
Evidence: `RuntimeVisualStateReader` exposes only node visual state; renderer has no
protocol, expression, alarm, or subscription implementation.  
Tests: Targeted alarm-state DOM update.  
Action taken: None required.  
Remaining risk: Runtime refresh currently targets nodes only.

## Events

Requirement: Delegate pointer events and clean listeners.  
Status: PASS  
Evidence: Three root listeners resolve entity metadata by ancestor traversal and
are removed on unmount.  
Tests: Metadata and disposal tests; Playwright pointer interaction test.  
Action taken: Added typed symbol metadata warning event.  
Remaining risk: Layer metadata is available only when the layer group itself is the
event target after child resolution.

## Security

Requirement: Use namespace DOM creation and avoid executable/untrusted markup.  
Status: PASS  
Evidence: `createElementNS`, `textContent`, safe attribute assignment; no
`innerHTML`, `eval`, HTML symbol callbacks, or external image support.  
Tests: Fallback/text rendering integration coverage.  
Action taken: Confirmed definition IDs use generated values, never user input.  
Remaining risk: User-provided CSS colors and style strings rely on browser SVG
attribute parsing; external URL-backed visuals remain unsupported.

## Accessibility

Requirement: Provide a named SVG root and useful labels without overstating support.  
Status: PARTIAL  
Evidence: Root `role="img"`, configurable `aria-label`, node `<title>`, and labelled
demo controls.  
Tests: Root role assertion and browser demo tests.  
Action taken: Documented limitations.  
Remaining risk: No full keyboard navigation, focus model, structured descriptions,
or screen-reader matrix has been completed.

## Performance

Requirement: Inspect representative rendering without unstable CI thresholds.  
Status: PARTIAL  
Evidence: Stable maps avoid full-DOM queries in update loops;
`renderer-performance.test.ts` covers 500 nodes and 499 connections.  
Tests: Performance fixture validates entity counts and records elapsed initial
render time without a failure threshold.  
Action taken: No speculative micro-optimization.  
Remaining risk: Separate 100/500/1,000-node medians, incremental/disposal timings,
browser memory, and larger exploratory scenarios are not yet automated.

## Test coverage

Requirement: Cover pure calculations, DOM integration, and browser behavior.  
Status: PASS  
Evidence: Calculation, geometry, renderer DOM, integration, performance, and
Playwright suites.  
Tests: Root `pnpm test` and `pnpm test:e2e`.  
Action taken: Added transform/port/endpoint conformance, multi-identity, removal,
cleanup, and typed-warning assertions.  
Remaining risk: Browser pointer metadata is exercised indirectly rather than for
every entity type.

## Documentation

Requirement: Document architecture, lifecycle, DOM, invalidation, viewport,
boundaries, data contracts, conventions, and this audit.  
Status: PASS  
Evidence: Existing architecture/convention documents plus
`phase-1-renderer-boundary.md`, `render-invalidation.md`, and this report.  
Tests: Formatting/linkable repository paths reviewed by `format:check`.  
Action taken: Corrected obsolete `RenderChangeSet` documentation.  
Remaining risk: Documentation links are not checked by an automated link checker.

## Recommendation

Phase 2 is **ready with follow-up items**. The implementation boundaries,
center-based geometry, incremental identity, multiple-instance ownership, and
disposal behavior are suitable for Phase 3. Before performance-sensitive Phase 4
commitments, add a repeatable browser benchmark matrix and complete the
accessibility interaction model.

See also:

- [Audit index](README.md)
- [Phase specifications](../phases/README.md)
- [Testing strategy](../master-spec/testing-strategy.md)
