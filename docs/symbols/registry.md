# Symbol registry

Create isolated instances with `new InMemorySymbolRegistry()`. `register` rejects duplicate
canonical IDs and alias collisions. `registerMany` retains deterministic insertion order.

Modern APIs are `require`, `resolveType`, `list`, `listByCategory`, `search` and `validate`.
Compatibility APIs `getAll`, `getByCategory` and `getCanonicalType` remain supported. Returned
collections are frozen snapshots. Alias resolution is O(1); search is a catalog scan.
