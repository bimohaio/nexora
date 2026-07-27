# Spatial Query

`SpatialQuerySource` is the narrow contract consumed by hit testing:

```text
queryPoint(point, radius) -> candidates
queryArea(rectangle)      -> candidates
```

`LinearSpatialQuery` is the deterministic baseline and additionally exposes `nearest`,
`intersects`, `contains`, `within`, and `overlap`. It intentionally performs a linear
scan. A future R-tree or renderer-specific index can replace it without changing the
pointer, hit-result or selection APIs.

Candidates carry data only: id, kind, bounds, layer policy, ordering and metadata. They
never carry DOM nodes.
