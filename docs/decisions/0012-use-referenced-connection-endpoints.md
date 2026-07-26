# ADR 0012: Use referenced connection endpoints

## Status

Accepted

## Context

Connection endpoints must follow nodes and stable symbol ports.

## Decision

Persist `{nodeId, portId}` references and never absolute endpoint coordinates.

## Consequences

Semantic validation needs symbol context; rendering resolves endpoints dynamically.

## Alternatives considered

Persisted coordinates duplicate state and become stale.
