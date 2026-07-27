# Designer Engine API

Status: Phase 4 MVP, implemented by `@web-scada/designer-engine`.

`createDesignerEngine(options)` creates the document-editing controller. The
controller exposes immutable document state, selection, viewport, command
execution, undo/redo, clipboard operations, ordering, transient interaction
state, and state/domain-event subscriptions.

The package also exports:

- `NativeDesignerEngine` for explicit construction;
- command classes for insert, move, resize, update, delete, fragment insert, and
  node ordering;
- `InMemoryToolRegistry`, `DesignerToolController`, and the Select, Pan,
  Rectangle, and Connection tools;
- configurable `DEFAULT_KEYBOARD_SHORTCUTS` and `handleDesignerShortcut`;
- pure selection, snapping, change-set, rectangle, and resize helpers.

Phase 5 extends `DesignerController` with rotation, multi-resize, grouping,
ungrouping, six alignment modes, horizontal/vertical distribution, nudge,
locking, visibility, layer reassignment, waypoint insertion/move/removal, and
endpoint reassignment. All methods synchronously commit one validated history
entry or make no change.

`DesignerInteractionSession<TInput, TPreview, TResult>` owns a cancelable gesture
lifecycle. `rankSnapCandidates` and `documentSnapTolerance` provide
renderer-neutral deterministic snapping. Geometry exports angle snapping,
rotated bounds, shared-pivot rotation, alignment, distribution, route
normalization, and segment projection.

`DesignerRenderAdapter` is the only Renderer boundary. It receives a full
document initially and incremental `DocumentChangeSet` values thereafter.
Transient hover, marquee, handles, previews, and guides are not serialized.

Clipboard methods are asynchronous. Callers should await `copy`, `cut`,
`paste`, and `duplicate` when operation order matters.

Persistent guides, arbitrary group pivots, drill-in selection, and mature
history merging remain TODO.

See also:

- [Designer architecture](../architecture/designer-architecture.md)
- [Tool lifecycle](../architecture/designer-tool-lifecycle.md)
- [Phase 04 Designer](../phases/phase-04-designer.md)
- [Public API policy](../master-spec/public-api-policy.md)
