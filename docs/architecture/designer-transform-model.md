# Designer Transform Model

Node `x` and `y` locate its unrotated bounds. Width and height remain positive;
rotation is normalized to `0 <= angle < 360` around the node center. The order is
local geometry, scale, center rotation, translation, then viewport transform.

Single rotation uses the node center. Multi-selection rotation uses the
axis-aligned union of rotated node bounds as a shared center, moves each node
center around that pivot, and increments each local rotation. Multi-resize uses
a shared selection box and scales positions and sizes while enforcing symbol
minimums. Locked or hidden entities are excluded.

Groups use existing `parentId`. The first deterministic eligible selection is
the parent and is marked with `metadata.designerGroup`. Children retain
document-space transforms; group transforms are atomically baked into parent
and descendants. This preserves Phase 1–4 serialization and Renderer behavior.

See also:

- [Advanced Editing architecture](advanced-editing-engine.md)
- [Node transform](../data-model/node-transform.md)
- [State separation](state-separation.md)
