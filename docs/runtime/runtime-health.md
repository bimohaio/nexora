# Runtime health

Health is derived from unresolved diagnostics and exposed by `engine.diagnostics.getHealth()` and
engine snapshots.

| State       | Meaning                                                |
| ----------- | ------------------------------------------------------ |
| `Healthy`   | No issue has been reported                             |
| `Warning`   | At least one warning is active                         |
| `Degraded`  | At least one error is active, but continuation is safe |
| `Critical`  | An unrecoverable fatal issue is active                 |
| `Recovered` | Previously reported issues have been cleared           |

Metrics are available from `engine.diagnostics.metrics.snapshot(activeSubscriptions)`. They include
updates, failures, warnings, errors, subscriptions, scheduler latency, dispatch duration, and
average resolver duration. Counters are synchronous and allocation-light; snapshots allocate only
when requested.
