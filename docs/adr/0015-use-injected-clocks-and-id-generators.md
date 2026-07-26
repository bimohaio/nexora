# ADR 0015: Use injected clocks and ID generators

## Status

Accepted

## Context

Production requires secure unique IDs and real timestamps while tests require determinism.

## Decision

Inject `Clock` and `EntityIdGenerator`; defaults use ISO system time and portable ULIDs.

## Consequences

Tests are stable and production IDs are not weak random strings.

## Alternatives considered

Scattered dates and randomness made behavior untestable.

See also:

- [ADR index](README.md)
- [Master architecture](../master-spec/architecture.md)
- [Architecture index](../architecture/README.md)
