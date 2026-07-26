# Document lifecycle

Documents are created through `createScadaDocument` or imported through `parseDocument`/`parseDocumentJson`. Imported data follows structural validation → version inspection and optional migration → safe normalization → semantic validation. Applications serialize normalized documents with `serializeDocumentJson`.

Mutations create new arrays/entities only where changed, update `metadata.updatedAt`, validate the complete candidate atomically, and return changes/events. A failed mutation returns the original document.
