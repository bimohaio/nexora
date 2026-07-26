# Binding Engine API

Status: TODO — no standalone Binding Engine package or accepted public API exists.

SCADA Core currently defines persisted binding models, and Runtime Engine exposes a
minimal `BindingEvaluator` contract. A future Binding Engine API must define
evaluation inputs, outputs, diagnostics, transformations, and lifecycle without
mutating design properties.

See also:

- [Binding model](../data-model/binding.md)
- [Phase 08 Binding](../phases/phase-08-binding.md)
- [State separation](../architecture/state-separation.md)
