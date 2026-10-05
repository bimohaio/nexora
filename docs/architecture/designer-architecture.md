# Designer Architecture

The Designer Engine is an orchestration layer. SCADA Core owns the immutable
document and validation, History Engine owns command history, Geometry owns
coordinate/snap calculations, the Symbol Registry supplies metadata and minimum
dimensions, and Renderer draws the document. The Designer owns tools, selection,
clipboard orchestration, viewport state, and transient editing feedback.

Durable edits follow one path:

`tool or UI → Designer command → SCADA Core mutation → new document → change set → Renderer`

History observes committed Core commands through Designer's compatibility
adapter. It has no Renderer, DOM, framework, protocol, or runtime dependency.

Selection, hover, marquee, handles, guides, and previews live only in
`DesignerRuntimeState`; they never enter `ScadaDocument`.

See also:

- [Tool lifecycle](designer-tool-lifecycle.md)
- [Selection lifecycle](designer-selection-lifecycle.md)
- [Command flow](designer-command-flow.md)
- [State separation](state-separation.md)
- [Designer API](../api/designer-api.md)
