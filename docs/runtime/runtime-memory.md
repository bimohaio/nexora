# Runtime memory

`RuntimeMemoryAudit` records subscriptions, snapshot and visual-state caches, queues, pools, and
disposed resources. Comparing captures detects monotonic retention in bounded structures.

`RuntimeObjectPool` is bounded and intended only for internal mutable temporaries. Pooled values
must never enter immutable snapshots. Queues clear their maps after every flush; dispatchers,
schedulers, subscriptions, and pools expose explicit disposal or clearing operations.
