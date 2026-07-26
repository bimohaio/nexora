# ADR 0001: Use TypeScript

## Status

Accepted

## Context

Industrial documents need stable, inspectable contracts across browsers and Node.js.

## Decision

Use strict TypeScript with ES modules and readonly public models.

## Consequences

Invalid states are caught early; consumers need a TypeScript-compatible build step.

## Alternatives considered

JavaScript with JSDoc was less enforceable. Rust/Wasm would increase integration complexity at this stage.
