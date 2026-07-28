# Direct bindings

A direct binding reads one Runtime Engine data point by its stable key and returns one
immutable `DirectBindingEvaluationResult`. Evaluation accepts a narrow snapshot-compatible
reader with `get`, optional `revision`, and optional `timestamp`; it never mutates or
subscribes to the store.

```ts
const result = evaluateDirectBinding(
  {
    id: "binding_pump_active",
    source: { type: "tag", tagId: "plant.line1.pump.running" },
    target: {
      type: "node-property",
      nodeId: "node_pump_01",
      property: "active"
    },
    mode: "one-way",
    enabled: true,
    fallback: false
  },
  { runtime: runtimeSnapshot }
);
```

`good` and `uncertain` resolve by default. `bad`, `offline`, and `unknown` are rejected
unless `rejectedQuality: "accept"` is explicit. `maximumAgeMs` enables stale rejection
against an explicit evaluation time or snapshot time.

Missing, rejected-quality, and stale values use a compatible explicit fallback; otherwise
they are `unresolved`. Known target mismatches are `invalid`; a compatible fallback may be
used unless `fallbackOnTypeMismatch` is false. Disabled definitions do not perform lookup.
Unexpected reader failures become isolated `error` results.

Missing keys differ from `null`, `false`, `0`, and `""`. Generic node properties accept
JSON-safe values including `null`; known boolean, number, and string targets are
non-nullable. Numeric values must be finite. Strict matching is the only coercion policy.

Results preserve source quality, timestamp, and runtime revision without exposing the
runtime store. Diagnostics contain types and safe keys, not raw runtime values. Dependency
extraction returns exactly `{ kind: "runtime-value", key }` without lookup.

This phase performs no expressions, formatting, thresholds, scheduling, subscriptions,
renderer updates, protocol access, or visual-state aggregation.
