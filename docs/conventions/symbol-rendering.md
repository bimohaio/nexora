# Symbol rendering conventions

Symbol visual adapters belong to SVG-specific modules, never generic symbol metadata or core. Adapters scale from node width/height, use vector-effect where useful, read unknown properties defensively, apply runtime state without changing node properties, and update an existing symbol group.

Reusable labels use localization keys in metadata; demo node names are document content. Industrial visuals remain simple, vector-native, and inspectable.

See also:

- [Conventions index](README.md)
- [Dependency policy](../master-spec/dependency-rules.md)
- [Architecture](../architecture/README.md)
