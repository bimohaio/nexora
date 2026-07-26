# ADR 0014: Use JSON-safe extension data

## Status

Accepted

## Context

Vendors need controlled customization without weakening stable schemas.

## Decision

Allow opaque JSON-safe records at explicit extension points with namespaced keys.

## Consequences

Extensions round-trip without core interpretation; arbitrary unknown core fields remain unsupported.

## Alternatives considered

Free-form unknown fields make migrations and validation unreliable.

See also:

- [ADR index](README.md)
- [Master architecture](../master-spec/architecture.md)
- [Architecture index](../architecture/README.md)
