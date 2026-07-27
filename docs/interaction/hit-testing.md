# Hit Testing

`HitTestingEngine` queries a `SpatialQuerySource`, filters visibility, locking and
interaction policy, then delegates exact checks to registered `HitTestStrategy` objects.
Results are immutable and sorted by priority, depth, distance and finally id, making
picking deterministic.

```text
world point -> spatial candidates -> policy filter -> strategy -> HitResult[]
                                                           |
                                      cache/revisions <----+
```

Built-in bounding-box and circle strategies reuse Geometry. Applications can register
path, port, pixel or renderer-backed strategies without exposing renderer objects.
`SelectionController.selectHitResult()` is the stable selection hand-off.

The optional one-entry cache keys the query and validates engine, viewport and document
revisions. A revision mismatch automatically bypasses stale data.
