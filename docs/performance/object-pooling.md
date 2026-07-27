# Object Pooling

`ObjectPool` exposes pooled values only inside a callback. Values are reset in `finally` and never
returned directly to public callers.

Built-in pools cover temporary vectors, rectangles, and matrices. Generic callback-scoped pools
can support internal pointer-event and hit-result work. Pooling is optional, bounded, disposable,
and reports actual allocations to performance metrics.
