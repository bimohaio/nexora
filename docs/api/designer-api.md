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

`DesignerRenderAdapter` is the only Renderer boundary. It receives a full
document initially and incremental `DocumentChangeSet` values thereafter.
Transient hover, marquee, handles, previews, and guides are not serialized.

Clipboard methods are asynchronous. Callers should await `copy`, `cut`,
`paste`, and `duplicate` when operation order matters.

Future API additions remain TODO until their implementing phase; no group,
alignment, or distribution API is claimed by this MVP.

See also:

- [Designer architecture](../architecture/designer-architecture.md)
- [Tool lifecycle](../architecture/designer-tool-lifecycle.md)
- [Phase 04 Designer](../phases/phase-04-designer.md)
- [Public API policy](../master-spec/public-api-policy.md)
