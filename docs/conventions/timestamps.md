# Timestamps

Serialized timestamps are ISO 8601 strings. Creation and mutation services receive a `Clock`; production uses `SystemClock`, while tests inject `FixedClock`. Document creation must not be after the last update.

See also:

- [Conventions index](README.md)
- [Dependency policy](../master-spec/dependency-rules.md)
- [Architecture](../architecture/README.md)
