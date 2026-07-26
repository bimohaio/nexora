# Symbol naming

Canonical industrial types use lowercase, dot-separated category and kebab-case
name:

```text
process.centrifugal-pump
instrumentation.pressure-sensor
network-control.network-switch
```

Canonical categories are `process`, `instrumentation`, `electrical`, `bms`,
`safety`, and `network-control`. Stable port IDs use lowercase kebab case and
describe function rather than visual position, such as `hot-in`, `measurement`,
or `network-out`.

Aliases are compatibility inputs, never replacement canonical identifiers. They
must be unique, nonempty, and different from their canonical type.

See also:

- [Naming convention](naming.md)
- [Symbol API](../api/symbol-api.md)
- [Port model](../data-model/port.md)
