# Symbol runtime state

Symbol metadata declares supported states and runtime capabilities, but contains
no runtime values. Current states are normal, active, inactive, running, stopped,
warning, alarm, offline, and disabled.

Resolved runtime state remains ephemeral. Runtime Engine or application state
supplies it to the Renderer through `RuntimeVisualStateReader`; it is never
written into `ScadaNode.properties`. Unsupported gallery preview states fall back
to normal deterministically.

See also:

- [State separation](../architecture/state-separation.md)
- [Symbol definition](symbol-definition.md)
- [Runtime Engine API](../api/runtime-api.md)
