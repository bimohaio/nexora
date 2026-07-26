# Versioning and migrations

Schema versions use strict `major.minor.patch` syntax. Phase 1 supports exactly `1.0.0`; malformed and future documents fail safely. Older versions require a registered deterministic migration path.

`MigrationRegistry` rejects duplicate/non-forward edges, resolves paths with cycle-safe breadth-first search, and returns an empty path for the current version. No fake production migration exists.

See also:

- [Architecture index](README.md)
- [Master architecture](../master-spec/architecture.md)
- [Data model](../data-model/README.md)
