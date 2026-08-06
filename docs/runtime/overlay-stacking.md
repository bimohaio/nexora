# Overlay stacking

`resolveOverlayStack` filters invisible layers, removes duplicate stable IDs, sorts by numeric
priority then ID, resolves conflicts and enforces a configurable maximum. The immutable result is
already ordered for renderer consumption. Placement is semantic; renderers choose coordinates.
