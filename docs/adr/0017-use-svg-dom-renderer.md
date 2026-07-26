# ADR 0017: Use an SVG DOM renderer

## Status

Accepted

## Context

Viewer diagrams need scalable, inspectable, accessible native graphics.

## Decision

Create SVG elements with namespace-safe DOM APIs and no string-document generation.

## Consequences

Native styling/events/accessibility are available; large DOM scenes require measurement.

## Alternatives considered

Canvas/WebGL reduce DOM nodes but weaken semantics and are outside this phase.

See also:

- [ADR index](README.md)
- [Master architecture](../master-spec/architecture.md)
- [Architecture index](../architecture/README.md)
