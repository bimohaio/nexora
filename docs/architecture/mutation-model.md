# Mutation model

Mutation functions are pure from the caller's perspective: inputs are readonly and never modified. Success returns a new document, deterministic `DocumentChangeSet`, typed domain events, and non-fatal issues. Failure returns the exact original document and no events.

Removing a node removes its connections and target bindings, then reparents direct children to the removed node's parent. Removing the final layer is rejected; a non-empty layer requires a valid destination layer.

See also:

- [Architecture index](README.md)
- [Master architecture](../master-spec/architecture.md)
- [Data model](../data-model/README.md)
