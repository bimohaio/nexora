# ADR 0020: Use metadata-driven symbol renderers

## Status

Accepted

## Context

The main renderer must support extensible symbols without type-specific branches.

## Decision

Resolve generic metadata and SVG adapters through separate injected registries.

## Consequences

Future non-SVG renderers remain possible; a missing adapter needs a fallback.

## Alternatives considered

Switch statements in the main renderer violate extensibility and package boundaries.

See also:

- [ADR index](README.md)
- [Master architecture](../master-spec/architecture.md)
- [Architecture index](../architecture/README.md)
