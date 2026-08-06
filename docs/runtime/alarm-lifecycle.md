# Runtime alarm lifecycle

The deterministic lifecycle is:

```text
NORMAL -> ACTIVE_UNACK -> ACTIVE_ACK -> NORMAL
                   \-> RETURNED_UNACK -> NORMAL (acknowledge)
```

An active condition requiring acknowledgement enters `ACTIVE_UNACK`. Acknowledgement changes it
to `ACTIVE_ACK`. If an unacknowledged condition returns, it enters `RETURNED_UNACK` and remains in
the alarm count until acknowledged. Clearing an acknowledged alarm returns directly to `NORMAL`.
An out-of-order timestamp is ignored by identity, preventing stale provider data from reversing
newer state.

Acknowledgement is session runtime state only. This phase does not claim remote authority,
persistence, history, dialogs, or notification delivery.
