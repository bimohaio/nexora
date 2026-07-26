# Designer Selection Lifecycle

Selection contains ordered, deduplicated node and connection IDs. Replace is
the default, Shift adds, and Ctrl/Command toggles. Marquee selection uses
Geometry rectangle intersection; Select All includes visible entities and
Clear removes both entity sets.

A drag captures the original selected nodes, presents transient interaction
state while moving, then commits one move command on pointer up. Resize uses one
selected node, one of eight handles, and minimum dimensions from symbol
metadata.

See also:

- [Tool lifecycle](designer-tool-lifecycle.md)
- [Overlay system](designer-overlay-system.md)
- [Data model](../data-model/scada-document.md)
