# Designer Command Flow

Every durable Designer edit is a Core `Command`. Snapshot-backed Designer
commands call immutable Core mutations and retain before/after documents for
deterministic undo and redo. The history cursor is invalidated when a new
command follows undo.

After execution, the engine derives an incremental `DocumentChangeSet`, removes
stale selection IDs, sends changes to the Renderer adapter, and emits state and
domain notifications. Failed Core validation leaves the document unchanged.

See also:

- [Designer architecture](designer-architecture.md)
- [Command system](command-system.md)
- [Rendering architecture](rendering-architecture.md)
