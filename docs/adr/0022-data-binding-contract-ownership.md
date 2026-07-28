# ADR 0022 — Data Binding Contract Ownership and Package Boundaries

Status: Accepted

## Context

Core already persists `PropertyBinding` in schema `1.0.0`, while Runtime Engine already
owns normalized runtime values and resolved visual state. Phase 8 needs extensible
evaluation contracts without duplicate ownership or a schema-breaking rewrite.

## Decision

Persisted definitions stay in Core. Binding Engine aliases those public contracts and owns
dependency, diagnostic, registry, normalization, validation, and resolved-result
contracts. It depends on Core only. Renderers receive resolved state and do not evaluate.
Runtime values remain in Runtime Engine. Expressions remain inert data. Registries are
explicit isolated instances, not global mutable state.

## Alternatives

Moving persisted definitions into Binding Engine would invert Core's document ownership
and introduce cycles. Putting evaluation in a renderer would couple the domain to SVG/DOM.
Duplicating runtime value types would create competing authorities. Executable JavaScript
expressions and global registries were rejected for security and test isolation.

## Consequences

Future evaluators can evolve behind renderer-neutral contracts. The existing source and
target discriminators remain the compatibility vocabulary until a versioned migration is
justified. Core validation cannot depend on Binding Engine, so Core enforces document
shape while Binding Engine adds domain-specific diagnostics.

## Compatibility

Schema remains `1.0.0`; existing valid bindings and exports are preserved. Unknown plugin
data is preserved in `extensions`, while unknown persisted source/target discriminators
remain invalid under the current closed schema.

## Migration

None. A future discriminator or owner-field change requires a Core schema migration and
round-trip compatibility tests.

## References

- Master Specification, Phase 8
- `docs/architecture/binding-ownership.md`
- `docs/data-model/binding-definitions.md`
