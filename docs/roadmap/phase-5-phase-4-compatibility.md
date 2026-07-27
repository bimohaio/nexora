# Phase 5 — Phase 4 Compatibility

| Capability            | Existing API                                     | Owner             | Status               | Phase 5 strategy                                 |
| --------------------- | ------------------------------------------------ | ----------------- | -------------------- | ------------------------------------------------ |
| Insert/delete/update  | Core mutations and Designer commands             | Core/Designer     | AS_IMPLEMENTED       | Reused                                           |
| Selection and marquee | `SelectionState`, Select Tool                    | Designer          | AS_IMPLEMENTED       | Reused and lock-aware                            |
| Move/resize           | `MoveNodesCommand`, `ResizeNodeCommand`          | Designer          | HARDENING_REQUIRED   | Multi-entity operations added                    |
| Viewport              | Geometry conversions and renderer adapter        | Geometry/Designer | AS_IMPLEMENTED       | Reused                                           |
| Clipboard             | version 1 internal fragment                      | Designer          | HARDENING_REQUIRED   | Group descendants and parent remap added         |
| Connections           | Core endpoints/waypoints and Connection Tool     | Core/Designer     | HARDENING_REQUIRED   | Waypoint and reconnect APIs added                |
| History               | `CommandHistory` and snapshot commands           | Designer          | COMPATIBLE_VARIATION | Atomic commands reuse snapshots                  |
| Groups                | Core `parentId` and cycle validation             | Core              | COMPATIBLE_VARIATION | No schema migration; parent-node grouping policy |
| Overlay               | renderer-neutral runtime state, SVG demo overlay | Designer/demo     | AS_IMPLEMENTED       | Rotation and advanced handles added              |
| Layer panel           | layer data existed; no panel control             | Demo              | HARDENING_REQUIRED   | Layer target control added                       |

No architectural blocker or breaking public API change was found. Phase 4
browser selection/delete/undo coverage remained in place.

See also:

- [Baseline](phase-5-baseline.md)
- [Phase 4 audit](../audits/phase-4-audit.md)
- [Advanced Editing architecture](../architecture/advanced-editing-engine.md)
