# Phase 08 — Binding

## Goal

Implement a Binding Engine that resolves persisted binding intent against runtime
values without mutating design state.

## Scope

Source resolution, transformations, formatting, fallback, target resolution,
diagnostics, dependency tracking, and incremental evaluation.

## Deliverables

Binding Engine package, evaluation pipeline, diagnostics, built-in
transformations, and Runtime/Renderer integration.

## Public APIs

TODO: no standalone Binding Engine API exists. Core binding models and Runtime
Engine `BindingEvaluator` are preliminary contracts only.

## Dependencies

Phase 01 binding model, Phase 06 Runtime Engine, Renderer resolved-state input, and
security rules for expressions.

## Testing

Pure evaluation, type mismatch, fallback, quality propagation, dependency updates,
cycle rejection, and integration tests.

## Definition of Done

Bindings evaluate deterministically, report typed diagnostics, and never persist
runtime values into design properties.

## Exit Criteria

Expression/security policy, API review, conformance suite, and documentation are
accepted.

See also:

- [Binding Engine API](../api/binding-api.md)
- [Binding model](../data-model/binding.md)
- [State separation](../architecture/state-separation.md)
