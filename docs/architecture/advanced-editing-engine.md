# Advanced Editing Engine

Phase 5 extends `NativeDesignerEngine`; it does not create a parallel editor.
Input is routed through tools or typed keyboard actions. Long gestures expose
transient previews and commit one `AtomicDocumentCommand`. Core semantic
validation accepts the complete candidate or leaves the document unchanged.
The resulting identity-based `DocumentChangeSet` drives incremental rendering.

`DesignerInteractionSession` has active, committed, canceled, and disposed
states. It captures operation closures, rejects updates after completion,
cancels safely, and runs cleanup exactly once.

Package ownership remains:

- Core: persisted document, parent cycles, endpoint and port validity;
- Geometry: rotation, bounds, alignment, distribution, route calculations;
- Designer: editing policy, selection, sessions, commands, history and clipboard;
- demo SVG overlay: visual handles and previews only.

See also:

- [Transform model](designer-transform-model.md)
- [Connection editing](connection-editing-model.md)
- [Command flow](designer-command-flow.md)
- [Phase 5 specification](../phases/phase-05-editing.md)
