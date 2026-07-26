# Phase 05 — Editing

## Goal

Add deterministic document editing workflows on top of immutable SCADA Core
mutations.

## Scope

Create, move, resize, rotate, connect, delete, duplicate, clipboard, snapping, and
property-editing workflows.

## Deliverables

Editing tools, command translation, previews, validation feedback, and designer
integration.

## Public APIs

TODO: editing-session and tool contracts are not yet public. Existing Core commands
and `ClipboardAdapter` are the only baseline.

## Dependencies

Phase 04 Designer, Core mutation model, geometry, symbol ports, and Renderer
incremental updates.

## Testing

Gesture-to-command tests, mutation failure behavior, geometry snapping,
connection validity, clipboard boundaries, and browser editing flows.

## Definition of Done

Each completed gesture commits a valid deterministic document change and preserves
unrelated identity.

## Exit Criteria

Editing operations are accessible, validated, documented, and pass integration and
browser suites.

See also:

- [Mutation model](../architecture/mutation-model.md)
- [Document mutations](../conventions/document-mutations.md)
- [Phase 11 History](phase-11-history.md)
