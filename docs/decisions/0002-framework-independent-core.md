# ADR 0002: Framework-independent core

## Status

Accepted

## Context

The engine must work in plain TypeScript, frameworks, desktop shells, browsers, and Node.js tools.

## Decision

Keep core free of DOM, transport, storage, renderer, engine, and UI dependencies.

## Consequences

Adapters require explicit boundaries, while the model remains portable and easily tested.

## Alternatives considered

A framework-owned model would accelerate one UI but lock other consumers to its lifecycle.
