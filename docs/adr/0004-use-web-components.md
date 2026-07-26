# ADR 0004: Use Web Components

## Status

Accepted

## Context

Reusable browser UI must integrate with multiple frameworks without adopting one.

## Decision

Use Custom Elements, Custom Events, and CSS custom properties as the future adapter surface.

## Consequences

Components stay thin and localization-ready; browser compatibility and lifecycle testing are required later.

## Alternatives considered

Framework-specific components would fragment the engine and duplicate UI integration.

See also:

- [ADR index](README.md)
- [Master architecture](../master-spec/architecture.md)
- [Architecture index](../architecture/README.md)
