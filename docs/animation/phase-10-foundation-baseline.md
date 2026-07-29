# Phase 10 Foundation Baseline

| Current component     | Current responsibility                                    | Package                                  | Public API                                             | Existing related behavior                                               | Conflict with target architecture                                      | Compatibility risk | Classification       | Required action                                                            |
| --------------------- | --------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------ | -------------------- | -------------------------------------------------------------------------- |
| ISO clock             | Design-command timestamps                                 | `core`                                   | `Clock`, `SystemClock`, `FixedClock`                   | Returns ISO strings                                                     | Animation sampling requires numeric monotonic time                     | Low                | COMPATIBLE_VARIATION | Keep unchanged; add a dedicated numeric animation clock                    |
| Runtime snapshot      | Normalized values, quality, time, revisions and diffs     | `runtime-engine`                         | `RuntimeSnapshot`, `RuntimeChangeSet`, `DataQuality`   | Immutable cached snapshots                                              | None                                                                   | Low                | AS_IMPLEMENTED       | Reuse quality and define Phase 10 input adapters                           |
| Runtime frame driver  | Coalesced runtime rendering                               | `runtime-engine`                         | `RuntimeFrameDriver`                                   | Abstract request/cancel boundary                                        | It is not an animation scheduler and has no deterministic test surface | Low                | COMPATIBLE_VARIATION | Keep unchanged; define the Phase 10 frame boundary separately              |
| Binding result        | Safe resolved binding output and dependency tracking      | `binding-engine`                         | `BindingEvaluationResult`, `BindingDependency`         | Safe expressions, thresholds, visual targets                            | Phase 10 trigger output is not explicit                                | Low                | HARDENING_REQUIRED   | Add a resolved Phase 10 output adapter; do not add an expression evaluator |
| Visual properties     | Property-level binding conflict resolution                | `binding-engine`                         | `VisualPropertyCandidate`, `ResolvedTargetVisualState` | Priority and stable declaration-order tie break                         | No alarm/animation layer model                                         | Low                | AS_IMPLEMENTED       | Reuse its output; define Phase 10 property-level layers                    |
| Symbol metadata       | Stable symbol definitions and future runtime capabilities | `symbols`                                | `SymbolDefinition`, `runtimeCapabilities`              | `animation-compatible` and `alarm-visual-compatible` declarations exist | Target/part capabilities are not explicit                              | Low                | HARDENING_REQUIRED   | Add optional renderer-neutral Phase 10 capabilities                        |
| Runtime visual state  | Transient symbol visual resolution                        | `runtime-engine`                         | `ResolvedSymbolVisualState`                            | Warning/alarm booleans and quality fallback                             | Alarm severity and acknowledgment are not modeled                      | Medium             | COMPATIBLE_VARIATION | Preserve API; introduce separate alarm visualization state                 |
| SVG renderer          | Incremental DOM creation/update and lifecycle             | `renderer-svg`                           | `SvgRenderer`, `RuntimeVisualStateReader`              | Preserves SVG identity and consumes resolved state                      | No Phase 10 update boundary                                            | Low                | HARDENING_REQUIRED   | Add an apply-only Phase 10 contract; no threshold evaluation               |
| Accessibility         | ARIA metadata and interaction diagnostics                 | `renderer-svg`, `interaction-engine`     | accessibility adapters                                 | Roles, labels, stable focus                                             | No alarm-specific semantic state                                       | Low                | HARDENING_REQUIRED   | Add renderer-neutral alarm accessibility state                             |
| Interaction scheduler | Coalesces interaction tasks                               | `interaction-engine`                     | internal scheduler                                     | One RAF-capable host adapter                                            | Not a public animation scheduler                                       | Low                | AS_IMPLEMENTED       | Do not reuse as animation execution or modify it                           |
| Demo alarm flag       | Demonstrates binding-driven warning/alarm visuals         | `runtime-demo`                           | demo-local provider                                    | Produces state/color values                                             | Demo terminology is not an alarm-management contract                   | Low                | FUTURE_MIGRATION     | Leave unchanged                                                            |
| Diagnostics           | Bounded/sanitized subsystem diagnostics                   | runtime/data-source/interaction packages | subsystem-specific APIs                                | Errors isolated from execution                                          | No Phase 10 codes or collector                                         | Low                | HARDENING_REQUIRED   | Add Phase 10 typed diagnostics and bounded collector                       |
| Per-symbol loops      | None found in symbol or SVG visual definitions            | `symbols`, `renderer-svg`                | N/A                                                    | No symbol timer/RAF loop                                                | None                                                                   | Low                | AS_IMPLEMENTED       | Add an architecture regression test                                        |

## Package decision

Phase 10 uses two instance-oriented packages:

- `@web-scada/animation-engine` owns renderer-neutral animation, motion, visibility,
  lifecycle, registry, validation and deterministic testing foundations.
- `@web-scada/alarm-visualization` owns renderer-neutral alarm state, severity,
  visual rules, validation and deterministic priority/visual resolution.

Neither package owns persisted `ScadaDocument` fields. Existing packages receive
only optional contract adapters. This avoids a schema migration and preserves all
serialized public contracts.

## Requirement traceability checklist

- [x] Animation definition, target, trigger, timing, easing and serialization validation
- [x] Animation lifecycle transitions, idempotent disposal and owner cleanup
- [x] Numeric clock and deterministic manual frame scheduler
- [x] Motion preference and visibility policies with deterministic test sources
- [x] Animation registry, diagnostics and property-level conflict resolution
- [x] Alarm identity, source, condition, severity, lifecycle, acknowledgment and shelving
- [x] Alarm visual/accessibility rules and reduced-motion fallback
- [x] Alarm severity registry and deterministic multi-alarm priority
- [x] Runtime, Binding, Symbol, Renderer and Designer integration contracts
- [x] Immutability, isolation, security and no-design-mutation tests
- [x] Architecture boundary and no-per-symbol-loop tests
- [x] Documentation, ADRs and final audit
