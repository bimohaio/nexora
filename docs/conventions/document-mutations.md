# Document mutations

Never modify a `ScadaDocument` directly. Call exported mutation services and inspect the discriminated result. On success, consume the returned document/change set/events. On failure, retain the returned original document and display or log structured issues.

See also:

- [Conventions index](README.md)
- [Dependency policy](../master-spec/dependency-rules.md)
- [Architecture](../architecture/README.md)
