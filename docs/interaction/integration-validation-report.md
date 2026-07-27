# Phase 7 integration validation report

Validated on 2026-07-27 with Node, pnpm, Vitest, happy-dom, and Playwright on
macOS. This report records observed repository evidence; it does not treat an
unmeasured property as passing.

## Repository and architecture audit

| Area                    | Result | Evidence                                                                                                                                                                                  |
| ----------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interaction foundation  | PASS   | Dispatcher tests cover session-first routing, capture/target/bubble ordering, priority, cancellation, batching, and immutable state.                                                      |
| Pointer and hit testing | PASS   | Pointer normalization and hit-testing tests use typed coordinate spaces and injected spatial queries.                                                                                     |
| Selection and drag      | PASS   | Selection policy/manager and drag tests cover immutable selection, locked/hidden constraints, previews, cancellation, and commands.                                                       |
| Keyboard and focus      | PASS   | Keyboard tests cover normalization, deterministic navigation, selection callbacks, escape, and disposal.                                                                                  |
| Accessibility           | PASS   | Engine, Designer adapter, SVG adapter, and browser tests cover tree, ARIA, focus, announcements, forced colors, and reduced motion.                                                       |
| Scheduler and renderer  | PASS   | Scheduler owns batching/coalescing; renderer receives adapter snapshots and owns DOM projection.                                                                                          |
| Lifecycle               | PASS   | Adapter, session, keyboard, accessibility, runtime, and renderer tests cover creation, update, idempotent disposal, and cleanup.                                                          |
| Framework independence  | PASS   | Interaction Engine imports only Geometry and has no DOM or framework dependency.                                                                                                          |
| Security                | PASS   | Source audit found no `eval`, `Function` construction, `innerHTML`, `outerHTML`, or HTML-string insertion in the validated packages. SVG creation and live-region text use DOM node APIs. |

The final package flow is:

```text
host input -> pointer/keyboard -> hit/focus -> selection/drag
  -> Designer command -> immutable document -> scheduler -> renderer -> browser
                                          \-> accessibility adapter -> ARIA/live region
```

## Public API audit

`@web-scada/interaction-engine` has one package-root export. Public values are
renderer-independent interfaces, immutable state factories, engines, policies,
diagnostics, and typed errors. Designer-specific bridges remain in
`@web-scada/designer-engine`; SVG DOM adapters remain in `@web-scada/renderer-svg`.
No deep package export is declared. Phase 7 does not remove or rename an existing
Designer, renderer, or runtime export.

Result: PASS. The package is version `0.0.0` and private, so semantic-version
compatibility is not yet a release guarantee.

## Dependency audit

| Package            | Direct internal dependencies                | Result |
| ------------------ | ------------------------------------------- | ------ |
| Geometry           | none                                        | PASS   |
| Interaction Engine | Geometry                                    | PASS   |
| Designer Engine    | Core, Geometry, Interaction Engine, Symbols | PASS   |
| Renderer SVG       | Core, Geometry, Interaction Engine, Symbols | PASS   |
| Runtime Engine     | Core, Symbols                               | PASS   |
| Web Components     | Designer, Interaction, Runtime              | PASS   |

No circular package dependency is present in the declared manifests. Interaction
Engine has no renderer, Designer, runtime, web-component, or browser dependency.
Renderer SVG depends on Interaction Engine only for typed accessibility adapters;
the interaction package does not depend back on the renderer.

## Performance and benchmark report

The benchmark runs 200 pointer updates, 50 drag and hit-test updates, five full
selection replacements, and 500 focus traversals per scale. The threshold is a
16 ms average operation budget.

|  Nodes |  Pointer |     Drag | Selection |    Focus | Hit testing |
| -----: | -------: | -------: | --------: | -------: | ----------: |
|    100 | 0.004 ms | 0.014 ms |  0.222 ms | 0.001 ms |    0.029 ms |
|  1,000 | 0.002 ms | 0.014 ms |  0.264 ms | 0.001 ms |    0.052 ms |
|  5,000 | 0.005 ms | 0.012 ms |  1.361 ms | 0.001 ms |    0.162 ms |
| 10,000 | 0.001 ms | 0.065 ms |  2.428 ms | 0.001 ms |    0.297 ms |
| 20,000 | 0.001 ms | 0.127 ms |  4.328 ms | 0.001 ms |    0.586 ms |

All measured averages pass. Heap deltas are sampled and affected by garbage
collection; the largest observed delta was about 16.2 MB during the 20,000-node
drag fixture. The benchmark is Node-based and does not claim browser FPS. The
browser burst test separately requires 1,000 pointer moves, 100 keyboard inputs,
and 100 wheel inputs plus two frames to finish within 2 seconds.

## Browser test report

Nine Playwright tests passed in 7.7 seconds. Coverage includes selection, drag/edit
history, keyboard nudge, focus, ARIA synchronization, forced colors, reduced motion, zoom/wheel input,
high-frequency interaction, and multiple application/renderer projects. The
configured Chromium suite is the certified local browser target. Cross-browser
certification requires installing and running the additional Playwright browser
projects and is tracked below rather than inferred.

## Test and quality report

The final non-benchmark validation executed 178 unit/integration tests across 42 files. All
Phase 7 interaction, Designer adapter, renderer accessibility, runtime, Geometry,
Core, and Symbols tests passed. One Phase 2 sample validation exposed invalid
legacy node IDs and incompatible signal/controller ports; the sample was repaired
without changing engine behavior.

Typecheck and build passed across all packages and applications. The initial lint failure
was a void-expression style issue in the browser burst test and was corrected.
The initial format check identified Phase 7 files and those files were formatted;
the final format and lint gates passed. The root benchmark gate now executes both
runtime and interaction benchmarks; all nine benchmark cases passed.

Statement coverage is not published because the repository does not install a
Vitest coverage provider. Functional coverage is comprehensive, but the numeric
90% target remains unverified.

## Technical debt

| ID      | Severity | Impact                                       | Owner        | Recommended phase   | Mitigation                                                                                    | Priority |
| ------- | -------- | -------------------------------------------- | ------------ | ------------------- | --------------------------------------------------------------------------------------------- | -------- |
| INT-001 | Medium   | Numeric 90% coverage cannot be certified.    | Tooling      | Phase 7 maintenance | Add the matching Vitest V8 coverage provider and a CI threshold.                              | P1       |
| INT-002 | Medium   | Local browser evidence is Chromium-only.     | QA           | Phase 7 maintenance | Install WebKit/Firefox and add explicit Playwright projects in CI.                            | P1       |
| INT-003 | Low      | Node microbenchmarks do not report real FPS. | Performance  | Phase 14            | Add browser tracing and frame/memory telemetry while retaining deterministic microbenchmarks. | P2       |
| INT-004 | Low      | Package is private and version 0.0.0.        | Architecture | Phase 15            | Freeze export inventory before public release.                                                | P2       |

## Production readiness

The interaction architecture, package boundaries, immutable state flow, safe DOM
projection, deterministic event flow, lifecycle cleanup, and measured performance
have no known architectural blocker. Phase 8 may consume the stable interaction
contracts without redesigning Interaction Engine.

All configured quality gates pass. Numeric coverage and non-Chromium browser
certification remain explicit evidence gaps, not hidden pass claims.
