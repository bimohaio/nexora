# Value mapping and formatting

The Binding Engine applies persisted `transformation` and `formatter` fields in one
canonical order:

```text
resolved source -> exact-value mapping -> formatting -> target validation
```

The source is supplied once to `applyBindingTransforms`. `transformBindingEvaluationResult`
retains its dependencies and runtime revision. A binding fallback is a final target value:
it is never mapped or formatted.

## Exact-value mapping

Use transformation type `exact-value`. Its options contain `rules`, optional
`defaultValue`, and `unmatchedPolicy` (`unresolved`, `passthrough`, or `use-default`).
Missing policy means `unresolved`; an existing default is used before the policy.
Disabled rules are serialized but do not match and do not participate in duplicate
detection. `-0` and `0` are equivalent. Enabled typed duplicates are invalid.

| Input         | Match                       | Output         | No match                            |
| ------------- | --------------------------- | -------------- | ----------------------------------- |
| string        | Same string and type        | Any JSON value | Default, passthrough, or unresolved |
| finite number | Same numeric value and type | Any JSON value | Same                                |
| boolean       | Same boolean and type       | Any JSON value | Same                                |
| null          | null only                   | Any JSON value | Same                                |

Thus `1` does not match `"1"`, and `false` does not match `0`. The maximum table
size is 1,024 rules. Compilation is O(n), lookup is O(1), and the internal `Map`
is held outside the serializable compiled object.

```json
{
  "type": "exact-value",
  "options": {
    "rules": [
      { "id": "stopped", "input": 0, "output": "STOPPED" },
      { "id": "running", "input": 1, "output": "RUNNING" }
    ],
    "defaultValue": "UNKNOWN"
  }
}
```

## Formatting

The locale is trusted evaluation context, never the machine default or persisted
document input. Tests use `en-US`. Number formatting uses `Intl.NumberFormat`
with validated options and normalizes negative zero to zero.

| Formatter  | Accepted input                                       | Output               | Options                                                    | Failure |
| ---------- | ---------------------------------------------------- | -------------------- | ---------------------------------------------------------- | ------- |
| `number`   | finite number; null with `nullText`                  | string               | fraction digits, grouping, prefix, unit, suffix, null text | invalid |
| `text`     | string, finite JSON number, boolean, configured null | string               | prefix, suffix, boolean labels, null text                  | invalid |
| `boolean`  | boolean only                                         | string               | true/false labels, prefix, suffix                          | invalid |
| `identity` | JSON value                                           | unchanged JSON value | none                                                       | none    |

Composition is exactly `prefix + formatted value + (" " + unit) + suffix`.
Whitespace in prefix/suffix is preserved and no other space is inferred. Fraction
digits are integers from 0 through 20, minimum cannot exceed maximum, and
`Intl.NumberFormat` supplies decimal rounding. Prefix/suffix limits are 128
characters, unit is 64, and final output is 4,096.

Text is inert. The engine performs no HTML interpretation, templates, regular
expressions, dynamic module loading, callbacks, protocol access, DOM access, or
unit conversion. Arrays and objects are not text-converted.

Number formatting returns a string, so it is suitable for a text target but not
a numeric target. Exact mappings may return numbers for numeric targets. Final
compatibility is checked by the Phase 8.01 target validator.
