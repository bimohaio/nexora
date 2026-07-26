# Testing strategy

Pure domain and geometry behavior uses unit tests. Package boundaries and document
flows use integration tests. Renderer DOM ownership and identity use DOM
integration tests. Browser tests cover user-visible composition without
duplicating pure logic tests. Performance fixtures collect diagnostic evidence
without unstable timing assertions.

Every phase defines its own required tests and exit criteria. Public API changes
must update contract tests and documentation in the same change.

See also:

- [Phase specifications](../phases/README.md)
- [Public API policy](public-api-policy.md)
- [Phase 2 hardening audit](../audits/phase-2-hardening-audit.md)
