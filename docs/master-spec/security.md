# Security policy

All external document input enters SCADA Core as `unknown` and passes version,
migration, structural, normalization, and semantic checks before use. Renderers
must use namespace-aware element creation and text-safe APIs, and must not execute
document content. Data-source and plugin boundaries require explicit trust and
capability policies before production use.

Security completion is phase-specific; this policy does not imply a completed
threat model, protocol hardening, or plugin sandbox.

See also:

- [Validation pipeline](../architecture/validation-pipeline.md)
- [JSON-safe values](../conventions/json-safe-values.md)
- [Phase 15 production](../phases/phase-15-production.md)
