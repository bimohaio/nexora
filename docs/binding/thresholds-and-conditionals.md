# Threshold and conditional bindings

Threshold evaluation belongs to `@web-scada/binding-engine`. It receives immutable
runtime data and returns a resolved JSON value; renderers never parse expressions
or evaluate rules.

## Rule model and ordering

`ThresholdRuleSet` is schema-versioned JSON. Rules retain declaration order.
`FIRST_MATCH` and `LAST_MATCH` use that order, `HIGHEST_PRIORITY` chooses the
largest integer priority and uses declaration order as its stable tie-break, and
`ALL_MATCHES` returns all matching outputs in declaration order. Disabled rules
are skipped. A rule-set fallback is used when no rule matches.

```ts
const colors = {
  schemaVersion: 1,
  id: "pressure-color",
  conflictResolution: "FIRST_MATCH",
  rules: [
    { id: "high", operator: ">", compareValue: 80, output: { kind: "color", value: "#d00" } },
    { id: "warning", operator: ">", compareValue: 60, output: { kind: "color", value: "#fc0" } }
  ],
  fallback: { kind: "color", value: "#0a0" }
};
```

Conditions compose with `and`, `or`, and `not`. A `ConditionalBinding` contains
ordered IF/ELSE IF branches and an optional condition-less ELSE branch. Branch
outputs may themselves be conditional bindings. Expression conditions reuse the
safe expression compiler and expose its runtime dependencies.

## Validation, safety, and serialization

Validation reports structured diagnostics for duplicate IDs, priority ties,
missing values, invalid ranges, output types, and unsafe regex. Regex patterns
are length-limited and reject backreferences, lookaround, adjacent quantifiers,
and quantified groups containing quantifiers. Compiled regex and expressions are
cached by source.

Use `serializeThresholdRuleSet` and `deserializeThresholdRuleSet` for persistence.
The loader accepts schema version 1, validates the payload, and deeply freezes the
result. A future schema must be migrated before loading.

## Incremental evaluation

`ThresholdDependencyTracker` maintains reverse O(1) dependency indexes. Register
the dependencies returned by condition evaluation, then pass changed runtime,
binding, document-property, or environment dependencies to `affected`. Only the
returned binding IDs need scheduling.

Limitations: expression conditions currently read runtime references from the
runtime snapshot; the direct threshold condition should be used for the supplied
value, quality, and timestamp. Regex deliberately implements a conservative
safe subset.
