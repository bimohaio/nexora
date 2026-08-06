# Runtime alarm state model

Phase 10.05 alarm state is ephemeral and owned by `RuntimeAlarmEngine`. It is never written to
`ScadaDocument`. `RuntimeAlarm` is an immutable occurrence state with stable identity, source,
category, severity, quality, acknowledgement data and renderer-neutral metadata.

Lifecycle and operating status are separate dimensions. Lifecycle is `NORMAL`, `ACTIVE_UNACK`,
`ACTIVE_ACK`, or `RETURNED_UNACK`. Status additionally represents active, acknowledged, shelved,
disabled, suppressed, unknown, offline, out-of-service and maintenance conditions. Shelved,
disabled, suppressed, maintenance and out-of-service alarms remain observable but do not become
the effective visual alarm.

`RuntimeAlarmEngine.evaluate` and `evaluateMany` validate inputs and enqueue immutable changes on
the injected `RuntimeTaskScheduler`. One scheduled task coalesces a batch; the engine never owns an
alarm-specific timer. `acknowledge` and `clear` use the same path. An immediate scheduler is the
standalone default; applications should inject their shared runtime scheduler.

Public entry points are exported from `@web-scada/runtime-engine`.
