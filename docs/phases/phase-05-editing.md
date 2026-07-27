# Phase 05 — Advanced Editing Engine

## Goal

Provide precise, deterministic, command-driven editing on top of the Phase 4
Designer without changing document or Renderer ownership.

## Scope

Rotation, parent-based grouping, alignment, equal-gap distribution, deterministic
snap candidates, multi-selection transforms, locking, visibility, ordering,
layer reassignment, waypoint editing, endpoint reassignment, keyboard nudge,
group-aware clipboard operations, and cancelable interaction sessions.

## Deliverables

Pure Geometry algorithms, atomic Designer commands, public editing APIs,
rotation overlay/demo controls, unit/integration/browser coverage, baseline,
compatibility report, architecture documentation, and audit.

## Public APIs

See [Designer API](../api/designer-api.md). Advanced operations extend
`DesignerController`; `DesignerInteractionSession`, angle/route/layout geometry,
and snap candidate helpers are exported.

## Dependencies

Phase 4 Designer, Core validation and `parentId`, Geometry, Symbol Registry port
metadata, Renderer incremental changes, and the existing snapshot history.

## Testing

Pure geometry, commands/history, lock and visibility policies, grouping and
clipboard remap, connections, cancellation/disposal, demo typecheck/build, and
Playwright editing flows.

## Definition of Done

Each committed operation is atomic, preserves document validity, produces a
small change set, is undoable, and leaves transient sessions/guides outside the
document.

## Exit Criteria

All workspace gates and applicable browser tests pass, with evidence recorded
in the Phase 5 audit.

See also:

- [Advanced Editing architecture](../architecture/advanced-editing-engine.md)
- [Phase 5 audit](../audits/phase-5-audit.md)
- [Phase 4 compatibility](../roadmap/phase-5-phase-4-compatibility.md)
