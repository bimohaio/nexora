# Designer Overlay System

The demo mounts an SVG overlay above the Renderer host. It draws selection
bounds, eight resize handles, hover bounds, marquee rectangles, connection
previews, and alignment guides using the same viewport transform as Renderer.

The overlay has no document ownership and does not serialize its state. Pointer
hit metadata originates from Renderer output; handles are overlay-owned hit
targets. Re-rendering the overlay cannot change the SCADA document.

See also:

- [Designer architecture](designer-architecture.md)
- [Selection lifecycle](designer-selection-lifecycle.md)
- [Rendering architecture](rendering-architecture.md)
