# ADR 0018: Use incremental DOM updates

## Status

Accepted

## Context

Moderate diagrams should not rebuild every element for one node change.

## Decision

Maintain instance-local entity maps and consume explicit change sets.

## Consequences

Unchanged element identity is stable; callers must accurately report changes.

## Alternatives considered

Automatic deep diffing adds cost and complexity. Full recreation loses identity.
