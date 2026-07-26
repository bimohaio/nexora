# ADR 0007: Use metadata-driven symbols

## Status

Accepted

## Context

Many domains need extensible symbols, ports, editable properties, bindings, and localized labels.

## Decision

Describe symbols through registered metadata and stable renderer identifiers.

## Consequences

Toolboxes and property panels can be generated consistently; registries must guard duplicate types.

## Alternatives considered

Hardcoded symbol subclasses tightly couple model, UI, and rendering and are difficult to extend.
