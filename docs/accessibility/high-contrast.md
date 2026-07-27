# High Contrast and Reduced Motion

Accessibility preferences expose `highContrast` and `prefersReducedMotion`. No animation behavior
is implemented in this phase.

The engine derives semantic visual tokens for background, focus, and selection. In high-contrast
mode these use system concepts such as `CanvasText`, `Highlight`, and `Canvas`. Renderers map the
tokens to their own visuals and expose reduced-motion state to future animation systems.
