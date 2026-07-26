# ADR 0013: Use a schema migration registry

## Status

Accepted

## Context

Versioned documents require explicit deterministic upgrades.

## Decision

Register forward migration edges and resolve cycle-safe paths to the current version.

## Consequences

Missing paths fail clearly; current documents use an empty path. No fake migration is shipped.

## Alternatives considered

Ad hoc conditional migration does not scale or audit well.
