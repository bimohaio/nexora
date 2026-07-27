# Runtime renderer and simulator integration

## Raw versus resolved state

`RuntimeSnapshot` contains raw normalized keys. `RuntimeVisualStateResolver`
produces renderer-ready node state, property/visibility overrides, connection
style/visibility overrides, and quality.

This separation leaves an insertion point for Phase 8:

```text
raw snapshot -> future Binding Engine -> resolved visual state -> renderer
```

Phase 6 supports direct tag, variable, and constant sources only. Expression
sources produce diagnostics.

## Renderer boundary

SVG renderer receives only `RuntimeVisualStateReader`. It neither owns the
store nor connects to providers. Runtime property/style objects are merged into
temporary render contexts. `ScadaDocument` and its entities remain unchanged.

Runtime value events carry an immutable `RuntimeVisualCommitEvent` containing
previous/current resolved snapshots and a sorted renderer-neutral diff.
`renderRuntimeChanges(snapshot, diff)` preserves unrelated DOM identity.
Removed/reset keys are also expanded through the resolver so fallback visuals
are restored. Engine value events include sorted raw changed keys and the
committed runtime revision.

The SVG renderer tracks the last visual revision per instance. Continuous diffs
update only listed entities. A skipped revision or reset triggers a safe full
runtime-state reapplication without rebuilding the document, layers, or entity
roots. Duplicate and stale snapshots are ignored.

```text
simulator tick
  -> public updateMany
  -> raw value store
  -> affected binding resolution
  -> immutable resolved snapshot + diff
  -> incremental SVG runtime update
```

## Simulator boundary

`SimulatedProcessProvider` lives in `apps/runtime-demo`, owns its timer, and
implements the same provider contract future adapters use. The demo proves:

- changing level, alarm state, timestamps, quality, and connection color;
- pause/resume;
- runtime reset;
- disconnect/offline/reconnect;
- visible runtime revision;
- disposal on unload.

Runtime Engine has no dependency on the simulator or application.
