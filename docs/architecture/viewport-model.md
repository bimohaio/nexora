# Viewport model

The shared convention is:

```text
screen = canvas × zoom + translation
```

`Viewport.x/y` are screen-space translation and `zoom` is scale. Defaults are zoom `1`, minimum `0.1`, maximum `8`. Zooming around an anchor preserves the canvas point under that anchor. Pan adds a screen-space delta. Fit-to-view scales and centers the logical canvas with padding. Grid geometry is world-aligned and receives the same viewport transform.
