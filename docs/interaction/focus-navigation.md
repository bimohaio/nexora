# Focus Navigation

Focus traversal uses explicit target metadata instead of DOM order.

```text
order -> target kind -> target ID
  |
  +-- parentId supplies parent/child traversal
```

Canvas, layer, node, connection, port, overlay, handle, and custom targets are supported. Duplicate
kind/ID pairs are collapsed. Hidden, locked, and disabled targets are filtered by default.
Read-only mode excludes edit-oriented ports and handles. Additional `FocusPolicy` implementations
can be injected and are composed in declaration order.

Traversal wraps for next and previous. First, last, parent, and child traversal are deterministic.
The renderer receives `FocusState`; it remains responsible for visual feedback.
