# Direct binding evaluation flow

```text
Core persisted binding
        ↓ structural/semantic validation
controlled direct registry contribution
        ↓ dependency extraction
RuntimeSnapshot-compatible lookup
        ↓ quality and optional age policy
strict target compatibility
        ↓ explicit fallback when needed
immutable BindingEvaluationResult
```

Binding Engine owns evaluation and target compatibility. Runtime Engine owns data points,
quality, timestamps, revisions, and snapshots. Core owns persistence. Renderers receive
resolved state only in a later integration phase.

The lookup is O(1) for snapshot implementations. Evaluation does not scan runtime state,
parse expressions, subscribe, schedule, aggregate symbol state, mutate a renderer, or
access protocols. Each batch item is evaluated independently in input order.

Expression bindings add a compile boundary before lookup:

```text
inert source → tokenizer → parser → readonly AST
             → semantic validation → static dependencies
             → bounded AST evaluator → target validation → result
```

Function registries are explicit instances containing trusted engine/application code.
Documents can call registered names but cannot register code or select modules. Compilation
does not evaluate expressions or resolve runtime dependencies.
