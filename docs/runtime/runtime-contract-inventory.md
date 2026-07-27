# Runtime public contract inventory

All exports use `@web-scada/runtime-engine` package root.

| Contract                                    | Owner          | Mutability / lifecycle                        | Consumers                         | Compatibility                 |
| ------------------------------------------- | -------------- | --------------------------------------------- | --------------------------------- | ----------------------------- |
| `RuntimeValue`                              | Runtime Engine | Frozen/copy provider compatibility input      | Providers, resolver               | COMPATIBLE_VARIATION          |
| `RuntimeDataPointInput`                     | Runtime Engine | Caller-owned readonly, validated atomically   | Simulators, future adapters       | MINOR addition                |
| `RuntimeDataPoint`                          | Runtime Engine | Deep normalized/frozen                        | Snapshots, future binding         | MINOR addition                |
| `DataQuality`, `RuntimeQualityDetail`       | Runtime Engine | Value types                                   | Store, resolver, providers        | Compatible extension          |
| `MutableTagStore`                           | Runtime Engine | Explicit dispose; revisioned                  | Provider engine, direct consumers | Backward-compatible extension |
| `RuntimeUpdateResult`, `RuntimeBatchResult` | Runtime Engine | Immutable result                              | Ingestion callers                 | MINOR addition                |
| `RuntimeSnapshot`                           | Runtime Engine | Cached immutable read API                     | Diagnostics, future binding       | MINOR addition                |
| `RuntimeChangeSet`, `RuntimeChange`         | Runtime Engine | Immutable per commit                          | Subscribers                       | MINOR addition                |
| `RuntimeSubscription`                       | Runtime Engine | Idempotent unsubscribe                        | Store consumers                   | MINOR addition                |
| `RuntimeTaskScheduler`                      | Runtime Engine | Explicit dispose                              | Tests/future downstream work      | MINOR addition                |
| `RuntimeScheduler`                          | Runtime Engine | Injected timer/clock adapter                  | Provider engine                   | AS_IMPLEMENTED                |
| `RuntimeVisualStateReader`                  | Runtime Engine | Read-only resolved state                      | SVG renderer                      | AS_IMPLEMENTED                |
| `RuntimeEngine`                             | Runtime Engine | Async provider lifecycle and direct ingestion | Runtime demo/apps                 | Backward-compatible extension |
| Renderer `RuntimeVisualStateReader`         | SVG renderer   | Optional structural reader methods            | SVG renderer                      | COMPATIBLE_VARIATION          |
| `refreshRuntimeStates`                      | SVG renderer   | Targeted node/connection update               | Runtime application               | Backward-compatible extension |

No serialized contract changed. No export was removed or renamed.
