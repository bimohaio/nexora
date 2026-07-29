# Symbol compatibility

All pre-refactor canonical IDs, aliases, property names, default sizes and port IDs are unchanged.
New contracts are optional fields and new methods. Legacy registry query methods remain public.
Alias lookup resolves a visual without rewriting the node's serialized `symbolType`; migration is
therefore explicit rather than automatic. Existing document schema and runtime snapshots are
unchanged.
