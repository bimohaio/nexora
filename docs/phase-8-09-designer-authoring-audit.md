# Phase 8/09 Designer Binding Authoring Audit

## Result

The Designer owns authoring, Core owns persisted `PropertyBinding` data, and the Binding Engine owns
validation and runtime evaluation.

## Boundary checks

- Only Core binding definitions are persisted.
- Preview returns labels, fallback data, and diagnostics; it never evaluates.
- No protocol adapter or `RuntimeSnapshot` is imported or accessed.
- Mutations use existing command history and support undo/redo.
- Clipboard duplication remaps entity and binding IDs and preserves node references.
- Import validates definitions and the combined document before one atomic command.
- Property metadata remains renderer-independent.
- The renderer contract is unchanged and receives only document/change-set data.

Existing version 1 clipboard payloads without `bindings` remain valid. Core document serialization
already includes bindings and therefore requires no schema change.
