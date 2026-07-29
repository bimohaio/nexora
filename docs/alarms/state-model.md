# Alarm State Model

Lifecycle (`inactive`, `active`, `returned-to-normal`, `disabled`),
acknowledgment and shelving are separate dimensions. This avoids a combinatorial
enum and preserves unacknowledged returned-to-normal state.

Occurrences are a future-facing immutable contract. No historian is implemented.
