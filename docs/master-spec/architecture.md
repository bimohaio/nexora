# Master architecture

The framework uses a normalized, versioned `ScadaDocument` as immutable design
state. SCADA Core owns parsing, migration, validation, mutation, and domain
contracts. Geometry and generic symbols remain platform-neutral. The Renderer
consumes validated readonly snapshots. Designer Engine and Runtime Engine build on
those boundaries without moving UI or protocol concerns into SCADA Core.

Binding Engine and Plugin SDK are architectural destinations, not claims of
implemented packages. Their public contracts must be introduced only in their
own phases.

See also:

- [Package boundaries](package-boundaries.md)
- [Module dependencies](../architecture/module-dependencies.md)
- [State separation](../architecture/state-separation.md)
- [Phase 1–Renderer boundary](../architecture/phase-1-renderer-boundary.md)
