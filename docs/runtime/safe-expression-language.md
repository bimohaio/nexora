# Safe expression language

`scada-expression-v1` is a small deterministic language for binding calculations. Source
is inert persisted text. It is scanned, parsed into a readonly AST, statically validated,
and evaluated by an explicit tree walker. It is not JavaScript.

## Grammar

```ebnf
expression     = conditional ;
conditional    = logical_or [ "?" expression ":" expression ] ;
logical_or     = logical_and { "||" logical_and } ;
logical_and    = equality { "&&" equality } ;
equality       = comparison { ( "==" | "!=" ) comparison } ;
comparison     = additive { ( "<" | "<=" | ">" | ">=" ) additive } ;
additive       = multiplicative { ( "+" | "-" ) multiplicative } ;
multiplicative = unary { ( "*" | "/" | "%" ) unary } ;
unary          = ( "!" | "+" | "-" ) unary | primary ;
primary        = number | string | boolean | null
               | "$" runtime_key
               | identifier "(" [ expression { "," expression } ] ")"
               | "(" expression ")" ;
```

Ranges use zero-based, half-open UTF-16 offsets. Runtime keys are opaque dot-separated
identities, never object paths. Empty segments and `__proto__`, `prototype`, or
`constructor` segments are rejected. Plain identifiers, bracket access, assignment,
templates, lambdas, imports, and arbitrary member access are unavailable. Chained
comparisons are rejected.

## Semantics

- Arithmetic requires finite numbers; `+` is numeric addition only.
- Division and remainder by zero fail with typed diagnostics.
- Comparisons require two finite numbers or two strings.
- Equality is strict by type and primitive value, without coercion.
- Logical operators and conditional conditions require booleans.
- `&&`, `||`, `?:`, and `if` evaluate only the selected branch.
- Missing runtime keys are not `null`; they make evaluation unresolved.
- `false`, `0`, `""`, and resolved `null` remain distinct values.
- Bad, offline, and unknown quality are rejected by default; uncertain is accepted.
- Final values use the Phase 8.01 strict target compatibility rules.

Built-ins are `abs`, `min`, `max`, `clamp`, `round`, `floor`, `ceil`, `coalesce`, and
short-circuiting `if`. They are synchronous, pure, finite, and deterministic. Applications
may explicitly supply trusted function definitions through an instance-owned registry;
document data cannot register implementations.

## Limits

| Limit              | Default |
| ------------------ | ------: |
| Source length      |   4,096 |
| Tokens             |   1,024 |
| AST nodes          |     512 |
| Nesting depth      |      32 |
| Function arguments |      32 |
| String length      |   2,048 |
| Runtime references |     128 |
| Evaluation steps   |   2,048 |

Limits are structural and deterministic. They do not rely on wall-clock timers. Static
dependencies include all branches, are deduplicated in source order, and do not require
runtime lookup. Evaluation short-circuiting may read only a subset.

```ts
const compiled = compileExpression("clamp($plant.tank.level / $plant.tank.capacity * 100, 0, 100)");
if (compiled.success) {
  const evaluated = evaluateExpression(compiled.compiled, {
    runtime: runtimeSnapshot
  });
}
```

Compilation errors are invalid and do not use fallback. Missing values, rejected quality,
arithmetic failures, and target mismatch may use an explicit target-compatible fallback.
Unexpected failures are isolated. Results expose dependencies and runtime revision, but
quality aggregation across multiple sources is intentionally deferred.

The language has no globals, prototype traversal, mutation, loops, recursion,
user-defined functions, network, filesystem, DOM, renderer, timers, random values,
dynamic imports, `eval`, or `Function` construction.
