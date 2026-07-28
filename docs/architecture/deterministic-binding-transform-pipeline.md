# Deterministic binding transform pipeline

Status: accepted

## Decision

Use Core's existing optional `transformation` and `formatter` fields rather than
new nested binding types. The only persisted transformation in this phase is
strict `exact-value`; formatters are `number`, `text`, `boolean`, and `identity`.
They execute in that order after source resolution and before target validation.

Exact matching uses typed primitive keys. Defaults describe a successful source
that did not match; binding fallback describes a failed source, transform, or
target check. The latter is already resolved and bypasses transforms.

The formatting locale is required trusted context. Persisted definitions cannot
select executable formatters or locales. Mapping tables, strings, digit settings,
and output are bounded. Compiled lookups are instance/value-owned and excluded
from serialization. Transform registrations are held by an application-owned
registry.

## Consequences

The design is deterministic for the definition, source value, and locale;
renderer- and protocol-independent; compatible with existing document round
trips; and safe for untrusted JSON definitions. Number formatting intentionally
changes the result type to string. Date formatting, thresholds, ranges, unit
conversion, localization UI, templates, and plugin executable formatters remain
deferred.

JavaScript callbacks and template engines were rejected because persisted data
would become executable. Renderer formatting was rejected because resolved
results must be renderer-independent. A generic JSON transformation language was
rejected as unnecessary and too broad for this phase.
