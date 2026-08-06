# Alarm overlay system

Supported semantic overlay requests are none, solid, tint, corner indicator, outline, glow,
cross-hatch, striped, mask, priority badge and status ribbon. The Phase 10.05 overlay policy maps to
one of these requests deterministically.

Overlay contracts contain a semantic theme token and optional opacity only. Geometry, stacking,
clipping, paint implementation and placement belong to the renderer. Reduced motion never removes
the overlay or other static alarm cues.
