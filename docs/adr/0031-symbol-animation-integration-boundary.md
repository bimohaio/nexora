# ADR 0031: Symbol animation integration boundary

Status: Accepted — 2026-08-01

## Context

Phase 10.03 must animate registry symbols without placing clocks, DOM references, runtime values, or renderer-specific contracts in persisted `ScadaDocument` data.

## Decision

`SymbolDefinition.animation` is optional, renderer-neutral registry metadata. Runtime resolves it into controllers and primitive instances. One shared scheduler owns time; Phase 10.02 primitives own interpolation; a transient store composes channel conflicts by priority; SVG adapters alone resolve and mutate render parts. Designer preview wraps the production runtime manager. Legacy `phase10Capabilities.animationTargets` are mapped at runtime and are not migrated into documents.

## Consequences

Old documents and non-animated/plugin symbols remain valid. Plugins may declare metadata but cannot receive renderer internals. Runtime disposal cleans every task and sample without touching persisted data. Adding a renderer requires only a sample adapter.
