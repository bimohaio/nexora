# Viewport optimization

Viewport visibility uses renderer-neutral rectangles, pan, viewport size and zoom. Results are
visible, partially visible or outside viewport with a deterministic visible fraction. The output
contains culling and virtual-rendering hints; renderers retain ownership of actual drawing and
geometry measurement.
