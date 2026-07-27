# Runtime diff

Resolved visual state is stored in immutable `RuntimeVisualSnapshot` objects. Each snapshot has a
monotonic `revision` and millisecond `timestamp`. A commit that produces no state change returns
`undefined`, so its revision does not advance.

`RuntimeVisualSnapshotRepository.commit()` compares only affected node and connection IDs. Its
`RuntimeVisualSnapshotDiff` reports added, updated, and removed IDs plus changed property names.
Unchanged entries retain object identity through structural sharing.

The SVG renderer accepts a snapshot and diff through `renderRuntimeChanges()`. Duplicate or older
revisions are ignored. Continuous revisions update only dirty entities; a gap or reset refreshes
all existing entities as a recovery path, without rebuilding the SVG root, definitions, layers,
viewport, or renderer instance.
