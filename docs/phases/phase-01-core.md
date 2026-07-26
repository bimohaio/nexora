# Phase 01 — SCADA Core

## Goal

Deliver the platform-neutral SCADA Core domain and validation pipeline.

## Scope

Versioned documents, entities, ports, parsing, migration, normalization,
validation, immutable mutations, commands, events, queries, geometry, and generic
symbol metadata.

## Deliverables

Implemented SCADA Core, geometry, and symbol contracts with documentation and
examples.

## Public APIs

Implemented exports are summarized in [SCADA Core API](../api/core-api.md).

## Dependencies

Phase 00 foundation. SCADA Core has no Renderer, DOM, transport, or application
dependency.

## Testing

Domain unit tests, port validation, mutation tests, serialization/migration flows,
geometry tests, and integration coverage.

## Definition of Done

Unknown input is safely imported; valid documents can be queried, mutated,
serialized, and reparsed without state-boundary violations.

## Exit Criteria

Phase 1 checklist and audit pass with documented remaining risks.

See also:

- [Phase 1 audit](../audits/phase-1-audit.md)
- [SCADA Core engine](../architecture/core-engine.md)
- [Validation pipeline](../architecture/validation-pipeline.md)
