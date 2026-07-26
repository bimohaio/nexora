# SCADA Core API

Status: implemented in `@web-scada/core`.

The package exports document and entity models, document construction, parsing and
serialization, schema migration, structural and semantic validation, immutable
mutations, `DocumentChangeSet`, commands, domain events, ports, queries, clocks,
IDs, validation context, errors, and schema version helpers.

Exact signatures are defined by `packages/core/src/index.ts` and its re-exported
modules. This page intentionally avoids duplicating every signature.

See also:

- [SCADA document](../data-model/scada-document.md)
- [SCADA Core engine](../architecture/core-engine.md)
- [Public API policy](../master-spec/public-api-policy.md)
