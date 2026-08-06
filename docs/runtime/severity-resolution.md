# Runtime alarm severity resolution

Built-in severities, lowest to highest, are none, info, low, medium, high, critical and emergency.
Each immutable definition has numeric priority, display name, semantic color token, blink/flash
policies, overlay policy and sound capability. Applications may construct an isolated
`AlarmSeverityRegistry` with custom definitions; `none` is required.

`resolveAlarm`, `resolveSeverity`, `resolveEffectivePriority` and `resolveVisualAlarm` are pure.
Effective ordering is stable and independent of input order:

1. eligible operating status;
2. explicit alarm priority;
3. severity priority;
4. status priority;
5. unacknowledged before acknowledged;
6. source priority;
7. newest timestamp;
8. lexicographic `alarmId` as the total-order tie-breaker.

Visual resolution returns semantic flags and tokens only. It contains no SVG, DOM, Web Component,
Designer or renderer types.
