# Designer Group Model

Phase 5 reuses `ScadaNode.parentId` and Core cycle validation instead of adding a
second persisted group collection. A group requires at least two visible,
unlocked, top-level nodes on one layer. The first sorted selected node becomes
the parent and is marked by JSON-safe `metadata.designerGroup: true`; remaining
members reference it through `parentId`.

Transforms are stored in document coordinates and baked into all members.
Ungroup removes the marker and direct parent references without changing visual
geometry. Nested groups are valid at the Core level but the Phase 5 creation UI
only groups top-level nodes, avoiding ambiguous mixed transforms.

See also:

- [Transform model](designer-transform-model.md)
- [Core validation](validation-pipeline.md)
- [Clipboard](../api/designer-api.md)
