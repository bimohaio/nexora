# Accessible Name Computation

Accessible names use the first non-empty value in this deterministic order:

```text
explicit label
  -> symbol metadata
  -> property metadata
  -> plugin metadata
  -> fallback name
  -> stable ID
  -> "Unnamed"
```

Metadata fields are checked in the order `accessibleName`, `label`, `displayName`, `name`, and
`title`. Values are trimmed and input objects are never modified.
