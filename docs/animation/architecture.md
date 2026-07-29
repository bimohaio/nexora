# Animation Foundation Architecture

`@web-scada/animation-engine` owns serializable animation intent and transient
lifecycle contracts. It has no renderer, DOM, framework or data-source dependency.

The supported flow is:

`RuntimeSnapshot → BindingEvaluationResult → Phase10BindingOutput → trigger intent
→ shared scheduler (Phase 10.01) → AnimationContribution → renderer update`.

Definitions are immutable configuration. Instances, samples, frames, visibility,
motion preference and contributions are runtime-only. Symbols declare targets and
never allocate a timer or frame loop.
