# Binding Engine Public API Review

All exports are available from the package root and compile to declarations and source maps.
Contracts use readonly arrays, maps, properties, and immutable result snapshots. Mutating lifecycle
operations are explicit methods on instance-owned engines, registries, caches, and coordinators.

## Compatibility decisions

- Core remains the sole owner of serialized binding definitions.
- `source.type` remains the persisted discriminator.
- Scheduling is adapter-based and deterministic tests use a manual adapter.
- Renderer integration depends on a minimal resolved-state consumer, not SVG or DOM types.
- Designer integration consumes validation APIs and does not expose authoring state to renderers.
- Error conditions use typed diagnostic codes rather than thrown exceptions at evaluation
  boundaries.

API additions should remain additive during Phase 9. Changes to persisted definitions, diagnostic
meaning, visual target normalization, or scheduling commit semantics require an ADR and migration
review.
