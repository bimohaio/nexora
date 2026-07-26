# Phase 02 — Renderer

## Goal

Render validated readonly SCADA documents as safe, incremental SVG.

## Scope

Renderer lifecycle, SVG symbol visuals, layers, nodes, ports, connections, grid,
viewport, runtime visual state, delegated events, and a runtime viewer demo.

## Deliverables

`@web-scada/renderer-svg`, Renderer documentation, DOM and browser tests,
performance fixture, and viewer demo.

## Public APIs

Implemented exports are summarized in [Renderer API](../api/renderer-api.md).

## Dependencies

Phase 01 SCADA Core, geometry, and generic symbols. The Renderer does not own
document import or application state.

## Testing

Pure calculations, geometry conformance, DOM lifecycle and identity, multiple
instances, performance fixture, and Playwright viewer behavior.

## Definition of Done

Rendering, incremental invalidation, disposal, security boundaries, and Phase 1
compatibility are verified.

## Exit Criteria

Phase 2 hardening audit passes or records explicit follow-up risks.

See also:

- [Phase 2 hardening audit](../audits/phase-2-hardening-audit.md)
- [Rendering architecture](../architecture/rendering-architecture.md)
- [Renderer lifecycle](../architecture/renderer-lifecycle.md)
