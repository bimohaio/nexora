# ARIA Model

`generateAriaMetadata` converts semantic nodes into an immutable renderer-neutral map.

Supported metadata includes role, label and description references, hidden, selected, expanded,
current, disabled, pressed, live, busy, role description, and logical tab index. Renderers decide
how those values are represented.

```text
AccessibilityNode -> ARIA generator -> AriaMetadata -> renderer adapter
```

Standard ARIA and graphics roles are registered by default. Applications may register additional
roles explicitly through `AccessibilityRoleRegistry`.
