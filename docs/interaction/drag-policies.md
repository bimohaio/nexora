# Drag Policies and Constraints

Policies validate whether a drag may start. Constraints validate each proposed update. Both are
ordered, composable contracts and stop at the first rejection.

Built-in policies:

- `MovablePolicy` requires every requested node to resolve and be visible.
- `DisabledDragPolicy` disables dragging.
- `CustomDragPolicy` adapts an application validator.

Built-in constraints:

- `MinimumMovementConstraint` suppresses preview and command creation below a threshold.
- `LockedNodeConstraint` rejects locked nodes.
- `HiddenLayerConstraint` delegates layer visibility/lock knowledge to the host.
- `ReadOnlyConstraint` rejects changes in read-only mode.
- `CompositeDragConstraint` combines application constraints.

```text
start -> policies -> active
update -> constraints -> rejected | preview transform
```
