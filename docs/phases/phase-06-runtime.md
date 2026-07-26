# Phase 06 — Runtime

## Goal

Implement Runtime Engine orchestration for ephemeral values and resolved visual
state.

## Scope

Tag-store lifecycle, provider coordination, quality and freshness, runtime
scheduling, resolved state delivery, and viewer integration.

## Deliverables

Runtime Engine implementation, provider-neutral orchestration, diagnostics, and
runtime demo integration.

## Public APIs

Current minimal contracts are listed in [Runtime Engine API](../api/runtime-api.md).
TODO: orchestration APIs require Phase 6 review.

## Dependencies

SCADA Core runtime settings, Renderer runtime-state reader, and future Binding
Engine boundary planning.

## Testing

Store subscriptions, quality transitions, lifecycle cleanup, scheduling,
reconnection simulations, and targeted visual updates.

## Definition of Done

Runtime values remain outside design properties and affected visuals update
without full document mutation.

## Exit Criteria

Lifecycle, state separation, diagnostics, and integration tests pass.

See also:

- [Runtime Engine API](../api/runtime-api.md)
- [Runtime settings](../data-model/runtime-settings.md)
- [State separation](../architecture/state-separation.md)
