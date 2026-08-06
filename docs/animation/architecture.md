# Animation Foundation Architecture

## Symbol integration boundary

Phase 10.03 extends the foundation through a strictly layered path: symbol definitions provide
renderer-neutral metadata; runtime controllers create primitive instances; the shared scheduler
owns time; a transient value store resolves priority conflicts; renderer adapters apply composed
samples. Designer preview wraps that same runtime manager. Symbols never own timers or renderer
elements, and animation samples never mutate persisted documents. See
[`symbol-integration.md`](symbol-integration.md) and ADR 0031.

`@web-scada/animation-engine` owns serializable animation intent and transient
lifecycle contracts. It has no renderer, DOM, framework or data-source dependency.

The supported flow is:

`RuntimeSnapshot → BindingEvaluationResult → Phase10BindingOutput → trigger intent
→ shared scheduler (Phase 10.01) → AnimationContribution → renderer update`.

Definitions are immutable configuration. Instances, samples, frames, visibility,
motion preference and contributions are runtime-only. Symbols declare targets and
never allocate a timer or frame loop.
