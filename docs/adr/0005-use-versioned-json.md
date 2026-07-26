# ADR 0005: Use versioned JSON

## Status

Accepted

## Context

Long-lived industrial graphics require interoperable persistence and controlled evolution.

## Decision

Persist JSON-safe documents with explicit semantic schema versions, beginning at `1.0.0`.

## Consequences

Unknown data must be structurally validated, migrated, semantically validated, then normalized.

## Alternatives considered

Binary formats are compact but harder to inspect and evolve. Unversioned JSON makes upgrades unsafe.

See also:

- [ADR index](README.md)
- [Master architecture](../master-spec/architecture.md)
- [Architecture index](../architecture/README.md)
