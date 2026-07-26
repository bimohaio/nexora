# ADR 0003: Use SVG first

## Status

Accepted

## Context

Industrial diagrams benefit from vector scaling, inspectability, CSS, accessibility, and native events.

## Decision

Define an SVG renderer boundary as the first rendering target.

## Consequences

DOM size will require future performance measurement; renderer contracts permit incremental updates.

## Alternatives considered

Canvas and WebGL may suit very large scenes but reduce native element semantics and are premature.
