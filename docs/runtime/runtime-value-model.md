# Runtime value and quality model

## Canonical data point

`RuntimeDataPoint` is the immutable internal/public snapshot representation:

- `key`: non-empty stable runtime identity;
- `value`: normalized `JsonValue`;
- `quality`: `good`, `uncertain`, `bad`, `offline`, or `unknown`;
- `qualityDetail`: optional renderer-neutral detail;
- `timestamp`: finite source timestamp in epoch milliseconds;
- `ingestionTimestamp`: engine clock at normalization;
- `source`: optional adapter identity;
- `sequence`: optional non-negative ordering number;
- `metadata`: optional JSON-safe record.

`RuntimeValue` remains the backward-compatible provider-facing shape with
`tagId` and ISO timestamp. The store converts it immediately to the canonical
model. It is a compatibility adapter, not a second authoritative state model.

## Validation and normalization

Inputs are untrusted. The store accepts JSON primitives, arrays, and plain
objects. It rejects functions, symbols, bigint, non-finite numbers, Date/class
instances, cyclic objects, `undefined`, and unsafe `__proto__`, `prototype`, or
`constructor` keys. Object keys are sorted, negative zero becomes zero, and
stored arrays/objects are frozen defensive copies.

Canonical `updateMany` is atomic: if any item or duplicate key is invalid, no
item is committed and revision does not change. The legacy `set`/`setMany`
methods delegate to the same normalization boundary.

## Equality and ordering

Change detection compares normalized value content, quality and detail, source
timestamp, source identity, sequence, and metadata. Ingestion time is excluded,
so retrying an identical sample is a no-op.

When both samples carry sequence, lower sequence loses. Otherwise an older
source timestamp loses. Equal timestamps may update when another compared field
changes. Timestamp-only and quality-only changes are real updates.

## Quality severity

Resolved visual quality uses this order:

```text
good < uncertain < unknown < bad < offline
```

External protocol quality mapping belongs to Phase 9. Stale good/unknown values
become uncertain; disconnected known values become offline.
