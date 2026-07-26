# Designer Architecture

The Designer Engine is an orchestration layer. SCADA Core owns the immutable
document and validation, Geometry owns coordinate/snap calculations, the Symbol
Registry supplies metadata and minimum dimensions, and Renderer draws the
document. The Designer owns tools, selection, history, clipboard orchestration,
viewport state, and transient editing feedback.

Durable edits follow one path:

`tool or UI → Designer command → SCADA Core mutation → new document → change set → Renderer`

Selection, hover, marquee, handles, guides, and previews live only in
`DesignerRuntimeState`; they never enter `ScadaDocument`.

See also:

- [Tool lifecycle](designer-tool-lifecycle.md)
- [Selection lifecycle](designer-selection-lifecycle.md)
- [Command flow](designer-command-flow.md)
- [State separation](state-separation.md)
- [Designer API](../api/designer-api.md)
