# Phase 04 — Designer MVP

## Goal

Deliver an interactive Designer Engine that composes SCADA Core, Geometry,
Renderer, and the industrial symbol library without moving domain state into UI
components.

## Scope

Pluggable tools, pointer and keyboard routing, single/multiple/marquee selection,
dragging with snap guides, eight-handle resize, command history, clipboard,
property editing, node ordering, viewport controls, and a separate transient
overlay.

## Deliverables

- `@web-scada/designer-engine` implementation and public contracts;
- Select, Pan, Rectangle, and Connection tools;
- interactive `apps/designer-demo`;
- command-backed edits, undo/redo, clipboard, snapping, and viewport control;
- tests and architecture/API documentation.

## Public APIs

See [Designer Engine API](../api/designer-api.md). Grouping, alignment, and
distribution are extension points and remain TODO rather than unsupported API
claims.

## Dependencies

Phases 01–03: immutable SCADA Core mutations, Geometry helpers, incremental
Renderer contracts, and Symbol Registry metadata.

## Testing

Automated coverage includes selection, marquee, drag, snap, resize minimums,
commands, undo/redo, clipboard identity, viewport, shortcuts, tool lifecycle,
incremental rendering, and overlay behavior. The demo is also build-tested.

## Definition of Done

Users can select and edit nodes, draw basic nodes/connections, undo and redo,
copy/cut/paste/duplicate, reorder nodes, edit properties, pan/zoom/fit/center,
and see all transient editing feedback in the overlay.

## Exit Criteria

All workspace formatting, lint, typecheck, unit/integration tests, and builds
pass; no transient editor state is serialized; all durable edits pass through
commands.

See also:

- [Designer architecture](../architecture/designer-architecture.md)
- [Command flow](../architecture/designer-command-flow.md)
- [Overlay system](../architecture/designer-overlay-system.md)
- [Phase 4 audit](../audits/phase-4-audit.md)
