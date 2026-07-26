# Error codes

Validation codes are stable UPPER_SNAKE_CASE identifiers exported as `CORE_ERROR_CODES`, separate from human-readable messages. Issues carry JSON Pointer paths, severity, and JSON-safe context. Codes must not be repurposed; add a new code when semantics differ.

See also:

- [Conventions index](README.md)
- [Dependency policy](../master-spec/dependency-rules.md)
- [Architecture](../architecture/README.md)
