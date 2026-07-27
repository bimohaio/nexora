# Interaction Cache

`RevisionedCache` is a bounded least-recently-used cache with deterministic revision invalidation.
Changing a revision clears stale values automatically.

`InteractionCacheLayer` separates caches for hit tests, coordinates, viewport transforms,
selection lookup, focus lookup, and layer visibility. `TransformCache` reuses geometry matrix
inversions. `BoundingVolumeCache` and `SpatialIndex` establish the boundary for future QuadTree,
R-Tree, or BVH implementations.
