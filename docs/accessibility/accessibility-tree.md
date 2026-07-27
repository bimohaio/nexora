# Accessibility Tree

`AccessibilityTree` stores renderer-independent nodes with ID, parent, ordered children, role,
label, description, state, properties, visibility, and focusability.

```text
graphics-document
  └─ group (layer)
       ├─ graphics-symbol (node)
       └─ graphics-object (connection)
```

Duplicate IDs, missing parents, and inconsistent child relationships are rejected. Policies are
applied before construction; descendants of filtered parents are removed. `replace` reuses
unchanged nodes, while `update` supports targeted upserts and removals.
