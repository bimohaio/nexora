# Public API policy

Public APIs are explicit exports from package entry points. New exports require a
documented owner, stable terminology, tests, and compatibility review. Renderer
internals, DOM caches, invalidation details, and application controllers remain
private unless multiple consumers demonstrate a stable need.

Breaking changes require a reason, affected exports, migration guidance, tests,
and documentation. Future phase documents and TODO API sections are not public
API commitments.

See also:

- [API documentation](../api/README.md)
- [Package boundaries](package-boundaries.md)
- [Versioning and migrations](../architecture/versioning-and-migrations.md)
