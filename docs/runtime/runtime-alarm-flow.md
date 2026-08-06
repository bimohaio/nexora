# Runtime alarm flow

```text
threshold / boolean / expression / manual / protocol / plugin input
  -> RuntimeAlarmEngine validation
  -> shared RuntimeTaskScheduler batch
  -> immutable lifecycle transition
  -> stable severity/priority resolution
  -> indexed symbol/connection/group/layer aggregation
  -> AlarmSnapshot + AlarmSnapshotDiff + runtime alarm events
  -> composeAlarmVisualSnapshot
  -> renderer consumes resolved alarmState only
```

The engine keeps scope-to-alarm indexes. A batch touches only changed alarm identities and
re-aggregates their affected scopes; it does not scan every symbol per frame. `AlarmSnapshotDiff`
reports activation, update, severity, acknowledgement, clear and timestamp changes plus sorted
affected scope IDs. Snapshot maps and aggregate arrays expose read-only immutable views.

Events are `AlarmActivated`, `AlarmCleared`, `SeverityChanged`, `Acknowledged`, `Shelved`,
`Suppressed`, and `AlarmReturned`. Applications connect `onEvent` to their runtime event boundary;
observer failures must be isolated by that boundary.
