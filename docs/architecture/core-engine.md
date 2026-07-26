# Core engine

`@web-scada/core` is a Node- and browser-compatible domain package with no DOM, SVG, transport, storage, renderer, or UI imports. It exposes immutable plain-data models, construction, parsing, normalization, validation, indexing, queries, mutations, changes, migrations, events, commands, clocks, and IDs.

Input crosses the trust boundary as `unknown`. Persisted data is constrained to `JsonValue`; opaque vendor data belongs only in explicit `extensions` or metadata fields.
