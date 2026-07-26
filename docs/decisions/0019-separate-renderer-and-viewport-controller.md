# ADR 0019: Separate renderer and viewport controller

## Status

Accepted

## Context

Programmatic viewport operations are rendering concerns, while input policy varies by host.

## Decision

Renderer exposes zoom/pan/fit primitives; the runtime demo owns pointer-pan and resize observation.

## Consequences

The engine remains reusable and disposable without imposing designer gestures.

## Alternatives considered

Embedding all pointer behavior would couple rendering to one interaction model.
