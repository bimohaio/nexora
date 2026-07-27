# Accessibility Focus Management

`AccessibilityFocusManager` synchronizes focusable accessibility nodes with the keyboard
`FocusEngine`. Hidden and disabled nodes are excluded. Focus restoration remembers the previous
logical target and restores it only if that target remains available.

Focus rings are renderer-neutral values: visibility, semantic color token, width, and offset.
High-contrast mode uses system color tokens. SVG and Web Component adapters own visual rendering
and DOM focus behavior.
