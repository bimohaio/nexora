# ADR 0009: Use immutable document mutations

## Status

Accepted

## Context

Editing, validation, history, and renderer handoff require atomic, observable changes.

## Decision

Mutation services return a new validated document, change set, and events; failures return the original.

## Consequences

Callers cannot observe partial state and unchanged references can be reused.

## Alternatives considered

In-place mutation was simpler but unsafe for history and incremental consumers. Immer was unnecessary.
