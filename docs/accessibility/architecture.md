# Accessibility Architecture

Accessibility is modeled as engine state rather than renderer attributes.

```text
Interaction / Selection -> FocusEngine -> AccessibilityEngine
                                            |
                         +------------------+------------------+
                         v                  v                  v
                AccessibilityTree       ARIA model       LiveRegion
                         |                  |                  |
                         +------------------+------------------+
                                            v
                                    Renderer adapter
```

The interaction package contains semantic logic. SVG and Web Component adapters translate stable
metadata into their own presentation environments. The engine never accesses DOM APIs and does not
mutate `ScadaDocument`.

Updates are incremental: unchanged tree nodes retain identity, ARIA is regenerated only for
changed IDs, and renderer adapters receive changed and removed IDs.
