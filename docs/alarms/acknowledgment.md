# Alarm Acknowledgment

Acknowledgment is transient runtime-session visualization state in this phase.
`AcknowledgeAlarmCommand` can represent a request, but the package does not claim
server authority or persistence. `acknowledgeAlarm` returns a new state snapshot.

Shelving is contract-only. Expiration must later use a shared clock; no per-alarm
timer exists.
