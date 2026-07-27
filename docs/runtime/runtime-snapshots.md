# Runtime snapshots

Runtime has two immutable snapshot layers:

- `RuntimeSnapshot` contains normalized tag data and is cached until the store revision changes.
- `RuntimeVisualSnapshot` contains renderer-neutral node and connection state.

Visual commits carry the previous snapshot, current snapshot, and `RuntimeVisualSnapshotDiff`.
Unchanged resolved states are structurally reused. Revisions are monotonic per engine instance;
consumers must not compare revisions across instances. Renderers should apply the diff through
`renderRuntimeChanges` and perform a full document render only for design-document replacement.
