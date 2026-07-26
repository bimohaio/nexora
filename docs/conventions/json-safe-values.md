# JSON-safe values

Persist only strings, finite numbers, booleans, null, arrays of JSON-safe values, and plain objects containing JSON-safe values. Functions, symbols, bigint, class instances, cyclic objects, `NaN`, and infinity are invalid. External values stay `unknown` until parsed.

See also:

- [Conventions index](README.md)
- [Dependency policy](../master-spec/dependency-rules.md)
- [Architecture](../architecture/README.md)
