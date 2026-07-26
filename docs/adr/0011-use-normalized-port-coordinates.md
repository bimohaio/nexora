# ADR 0011: Use normalized port coordinates

## Status

Accepted

## Context

Ports must scale with symbol instances independently of pixel dimensions.

## Decision

Persist symbol port positions in the inclusive `[0, 1]` range.

## Consequences

Geometry resolves canvas positions from transforms; invalid registry positions are rejected.

## Alternatives considered

Absolute offsets break resizing and reuse.

See also:

- [ADR index](README.md)
- [Master architecture](../master-spec/architecture.md)
- [Architecture index](../architecture/README.md)
