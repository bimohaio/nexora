# ADR 0027: Use transient Phase 10 state and a shared scheduler boundary

## Status

Accepted

## Context

Animation progress and live alarm state change frequently and must not mutate
persisted design documents. Per-symbol loops prevent batching and safe disposal.

## Decision

Keep animation and alarm configuration immutable and all live state transient.
Define a numeric clock and frame request boundary now. Phase 10.01 will build one
owner-aware scheduler over it. Alarm visualization references animation intent and
never starts timers.

## Consequences

Tests can advance time deterministically; renderer disposal can clean owner
registrations; serialized documents remain unchanged. Full sampling is deferred.

## Alternatives considered

CSS/DOM-owned animation and symbol-local intervals couple state to one renderer and
cannot meet deterministic lifecycle requirements.
