# ADR 0006: Separate design and runtime state

## Status

Accepted

## Context

Persisted layout changes slowly while telemetry is volatile, high-frequency, and quality-qualified.

## Decision

Keep runtime values in runtime stores and persist only binding declarations in design documents.

## Consequences

Documents remain deterministic and small; rendering must resolve bindings against a separate runtime snapshot.

## Alternatives considered

Writing tag values into node properties would contaminate history, persistence, and collaboration.
