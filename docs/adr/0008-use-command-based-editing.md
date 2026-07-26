# ADR 0008: Use command-based editing

## Status

Accepted

## Context

Designer actions need deterministic mutation boundaries and future undo/redo.

## Decision

Represent edits as typed commands with execute, undo, redo, merge, metadata, ID, and timestamp contracts.

## Consequences

Engines gain auditable history boundaries. Continuous drag commits one final entry rather than hundreds.

## Alternatives considered

Direct UI mutation is simple initially but prevents reliable history and central validation.

See also:

- [ADR index](README.md)
- [Master architecture](../master-spec/architecture.md)
- [Architecture index](../architecture/README.md)
