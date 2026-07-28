# ADR 0023 — Renderer-neutral visual property resolution and precedence

Status: Accepted

## Context

Binding evaluators already return typed results, while runtime and SVG packages already own
snapshots and native rendering respectively. A stable validation and conflict boundary was
missing.

## Decision

Keep Core `BindingTarget` serialization unchanged and normalize it inside the Binding Engine.
Use an instance-scoped descriptor registry and immutable snapshots. Resolve conflicts by explicit
priority, serialized declaration order, then binding ID. Do not retain stale prior values:
invalid or unresolved output falls back to design data, then descriptor defaults, then omission.
Emit a runtime-only property change set.

## Alternatives

Renderer-side evaluation was rejected because it duplicates expression and validation behavior.
Arbitrary object paths were rejected for security and unstable ownership. Last-write-wins was
rejected because collection iteration must not define runtime behavior. Generic deep merge was
rejected because ownership and prototype safety are unclear.

## Consequences

Renderers consume final JSON values and remain unaware of binding transformations. Callers must
provide declaration order when that distinction matters and must identify the owner kind of a
serialized visibility target. Unsupported layer/canvas and semantic-part targets fail explicitly.

## Migration

No persisted schema or public Core target is changed. Runtime snapshot adapters can copy resolved
target `properties` incrementally.

## References

See `docs/runtime/visual-property-resolution.md` and the Phase 8.05 audit.
