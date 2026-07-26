# ADR 0016: Keep symbol definitions metadata-driven

## Status

Accepted

## Context

Core validation and future editors need symbol properties and ports without renderer coupling.

## Decision

Symbols contain framework-neutral metadata only; the registry validates and resolves definitions.

## Consequences

Phase 1 works in Node.js and Phase 2 must add renderer adapters separately.

## Alternatives considered

Embedding SVG callbacks would pollute the generic package and prevent non-SVG consumers.

See also:

- [ADR index](README.md)
- [Master architecture](../master-spec/architecture.md)
- [Architecture index](../architecture/README.md)
