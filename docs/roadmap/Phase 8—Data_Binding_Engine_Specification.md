# Phase 8 — Data Binding Engine Specification

**Document type:** Phase Architecture and Implementation Specification
**Phase:** Phase 8 — Data Binding Engine
**Status:** Implementation Baseline
**Implementation language:** TypeScript
**Repository model:** Monorepo
**Primary package:** `packages/binding-engine`
**Primary audience:** Core-engine, runtime-engine, renderer, symbol-library, designer, QA, security, and integration developers

---

# 1. Document authority

This document defines the shared architectural and implementation requirements for Phase 8 of the Web SCADA Engine.

It is subordinate to the Web SCADA Engine Master Specification and must not override:

- existing compatible public APIs;
- established package boundaries;
- persisted document compatibility;
- runtime snapshot contracts;
- renderer contracts;
- validation and migration policies;
- security constraints;
- lifecycle rules.

This document is the common source of truth for:

```text
Phase_8_00 — Foundation and Contracts
Phase_8_01 — Safe Expression Engine
Phase_8_02 — Binding Evaluation Core
Phase_8_03 — Mapping, Threshold, and Formatting
Phase_8_04 — Dependency and Incremental Evaluation
Phase_8_05 — Runtime and Renderer Integration
Phase_8_06 — Final Validation and Audit
```

Implementation prompts for these subphases should reference this document rather than repeat all shared requirements.

---

# 2. Phase objective

Create a renderer-independent Data Binding Engine that transforms runtime values into deterministic resolved visual or behavioral properties.

The engine must support:

- direct runtime value binding;
- safe expression evaluation;
- discrete value mapping;
- threshold and range evaluation;
- value formatting;
- visibility binding;
- color binding;
- text binding;
- numeric property binding;
- animation-trigger binding;
- dependency extraction;
- incremental reevaluation;
- validation;
- serialization;
- diagnostics;
- failure isolation.

The intended data flow is:

```text
Persisted Binding Definitions
            +
Immutable Runtime State
            +
Evaluation Context
            ↓
      Binding Engine
            ↓
Resolved Renderer-Neutral Results
            ↓
 Runtime Engine / Renderer Integration
```

The renderer must not evaluate expressions or interpret binding definitions.

---

# 3. Phase completion criteria

Phase 8 is complete only when:

1. Binding definitions are typed and serializable.
2. Binding definitions pass structural and semantic validation.
3. Expressions are parsed and evaluated without `eval`.
4. Expressions cannot access arbitrary globals.
5. Binding failures are isolated per binding.
6. Runtime state and document state remain immutable.
7. Bindings can resolve text, numeric, boolean, color, visibility, and trigger values.
8. Direct, expression, mapping, threshold, and formatting behavior is implemented.
9. Dependency tracking identifies affected bindings.
10. Runtime changes reevaluate only affected bindings where practical.
11. Cyclic dependencies are detected or safely rejected.
12. Renderer-facing results are renderer-neutral.
13. Serialization round trips preserve binding meaning.
14. Existing document compatibility is preserved.
15. Unit, integration, security, and performance tests exist.
16. Public APIs and limitations are documented.
17. All applicable quality gates pass.
18. Final audit evidence is produced.
19. Phase 9 can consume Phase 8 APIs without modifying renderer internals.
20. No confirmed architectural blocker remains.

---

# 4. Architectural position

The Binding Engine sits between runtime state and resolved visual state.

```text
Data Source Adapters
        ↓
Runtime Engine
        ↓
Runtime Value Store / Runtime Snapshot
        ↓
Binding Engine
        ↓
Resolved Runtime Visual State
        ↓
Renderer Contract
        ↓
SVG / Canvas / WebGL / PDF
```

The Binding Engine must not connect directly to:

- MQTT;
- OPC UA;
- Modbus;
- BACnet;
- REST endpoints;
- WebSocket endpoints;
- databases;
- application stores;
- browser DOM;
- SVG elements;
- frontend frameworks.

The Binding Engine consumes already normalized runtime values.

---

# 5. Package responsibilities

The preferred package is:

```text
packages/binding-engine/
```

The actual repository layout may differ if an existing compatible package already owns this responsibility.

The package owns:

- binding contracts;
- binding definition types;
- binding validation;
- expression tokenization;
- expression parsing;
- expression AST;
- safe expression evaluation;
- mapping evaluation;
- threshold evaluation;
- formatting;
- dependency extraction;
- dependency indexing;
- incremental evaluation;
- result generation;
- diagnostics;
- public engine lifecycle;
- engine-level tests;
- engine documentation.

The package does not own:

- persisted document storage;
- document migration orchestration;
- runtime transport;
- tag subscription networking;
- renderer DOM updates;
- animation scheduling;
- alarm processing;
- designer UI;
- property-panel components;
- application state management;
- protocol credentials.

---

# 6. Allowed dependencies

The Binding Engine may depend on compatible shared contracts from:

```text
packages/shared
packages/core
packages/runtime-engine
```

It may depend on utility packages only when they:

- are already approved in the repository;
- do not introduce unsafe expression execution;
- do not expose browser-only behavior;
- do not create circular dependencies;
- do not significantly increase bundle size without justification;
- are compatible with the project license;
- support deterministic execution.

A dependency on `runtime-engine` should be avoided if it creates a cycle.

Prefer extracting renderer-neutral runtime contracts into an appropriate lower-level package when required.

---

# 7. Prohibited dependencies

The Binding Engine must not import:

- `renderer-svg`;
- any concrete renderer;
- Vue;
- React;
- Angular;
- Svelte;
- Web Components implementation code;
- application-specific stores;
- datasource implementations;
- protocol libraries;
- Node.js filesystem APIs in browser-facing runtime code;
- browser DOM APIs in pure evaluation code.

The expression subsystem must not depend on:

- JavaScript `eval`;
- `Function`;
- dynamic module execution;
- arbitrary JavaScript interpreters exposing global objects;
- unsafe template evaluation.

---

# 8. Existing implementation policy

Before creating or changing code, implementation agents must inspect the repository.

They must locate:

- current `BindingDefinition` types, if any;
- persisted bindings in `ScadaDocument`;
- runtime value and snapshot contracts;
- resolved symbol visual-state contracts;
- validation utilities;
- serialization utilities;
- error and diagnostic types;
- package export patterns;
- test conventions;
- benchmark conventions;
- public API compatibility requirements.

Existing code must be classified as:

```text
AS_IMPLEMENTED
COMPATIBLE_VARIATION
HARDENING_REQUIRED
FUTURE_MIGRATION
ARCHITECTURAL_BLOCKER
```

Do not rewrite compatible code merely because this document uses a different example name.

---

# 9. Data ownership

## 9.1 Persisted binding definitions

Persisted binding definitions belong to the Core document model.

They may be stored:

- in the top-level document binding collection;
- on bindable entities;
- through stable references to binding definitions;
- through another existing compatible normalized structure.

They must not contain:

- live runtime values;
- protocol connections;
- credentials;
- renderer objects;
- DOM nodes;
- functions;
- class instances requiring custom serialization;
- transient evaluation caches;
- active subscriptions.

## 9.2 Runtime values

Runtime values belong to the Runtime Engine.

The Binding Engine receives immutable views or snapshots.

It must not mutate:

- tag values;
- timestamps;
- quality values;
- runtime revisions;
- source metadata.

## 9.3 Evaluation state

Evaluation caches, indexes, and diagnostics belong to the Binding Engine instance.

They must not be serialized into the document.

## 9.4 Resolved visual state

Resolved visual state belongs to the runtime-resolution pipeline.

It is transient and renderer-neutral.

The renderer may consume it but must not become its authoritative owner.

---

# 10. Binding model

A binding associates one or more runtime inputs with a target property.

Conceptual structure:

```ts
interface BindingDefinition {
  readonly id: string;
  readonly kind: BindingKind;
  readonly target: Readonly<BindingTarget>;
  readonly enabled?: boolean;
  readonly fallback?: JsonValue;
  readonly errorPolicy?: BindingErrorPolicy;
  readonly metadata?: Readonly<Record<string, JsonValue>>;
}
```

The actual implementation may use discriminated unions.

A discriminated union is preferred when each binding kind has materially different fields.

Example:

```ts
type BindingDefinition =
  | DirectBindingDefinition
  | ExpressionBindingDefinition
  | MappingBindingDefinition
  | ThresholdBindingDefinition
  | CompositeBindingDefinition;
```

The final public API must follow repository conventions.

---

# 11. Binding identity

Every persisted binding must have a stable identity.

Binding IDs must be:

- unique within the owning document;
- deterministic when preserved across serialization;
- valid according to Core identifier policy;
- independent of runtime tag names;
- independent of renderer element IDs.

Binding IDs are used for:

- diagnostics;
- dependency indexes;
- incremental reevaluation;
- result lookup;
- audit evidence;
- migration;
- debugging.

---

# 12. Binding targets

A binding target identifies where a resolved value should be applied.

Conceptual target:

```ts
interface BindingTarget {
  readonly entityType: BindingEntityType;
  readonly entityId: string;
  readonly property: string;
}
```

Possible entity types include:

```text
document
canvas
layer
node
connection
symbol
symbol-part
```

Only targets supported by current architecture should be implemented.

Initial Phase 8 targets should prioritize:

- node visual properties;
- symbol runtime properties;
- connection visual properties;
- text content;
- visibility;
- numeric values;
- semantic colors;
- animation triggers.

A target must not directly contain:

- DOM selectors;
- CSS selectors;
- SVG element references;
- renderer cache keys;
- application component references.

---

# 13. Target property categories

The engine should classify bindable targets.

Recommended categories:

```text
BOOLEAN
NUMBER
STRING
COLOR
VISIBILITY
ENUM
JSON_VALUE
ANIMATION_TRIGGER
```

Property metadata should define:

- expected value category;
- nullable policy;
- default value;
- coercion policy;
- allowed range;
- allowed enum values;
- fallback behavior;
- renderer-neutral semantics.

Bindings must not silently assign arbitrary objects to typed properties.

---

# 14. Supported binding kinds

Phase 8 must support the following conceptual binding capabilities.

## 14.1 Direct binding

Resolves a single runtime value.

Example:

```text
tank.level ← tag:tank-01.level
```

## 14.2 Expression binding

Evaluates a controlled expression from one or more values.

Example:

```text
pump.active ← motor.running && !motor.fault
```

## 14.3 Mapping binding

Maps discrete values to outputs.

Example:

```text
0       → "Stopped"
1       → "Running"
2       → "Fault"
default → "Unknown"
```

## 14.4 Threshold binding

Maps numeric values or ranges to outputs.

Example:

```text
value < 40       → "normal"
40 <= value < 70 → "warning"
value >= 70      → "alarm"
```

## 14.5 Formatting binding

Formats resolved values.

Example:

```text
12.3456 → "12.35 °C"
```

## 14.6 Composite pipeline

A binding may require multiple stages:

```text
runtime value
      ↓
expression
      ↓
threshold
      ↓
mapping
      ↓
formatting
      ↓
target value
```

The architecture must define whether composition is represented through:

- nested binding definitions;
- explicit transformation stages;
- binding references;
- one normalized pipeline definition.

Avoid adding composition models that cannot be validated or incrementally evaluated.

---

# 15. Binding source references

Runtime sources must use stable, normalized references.

Conceptual source:

```ts
interface RuntimeValueReference {
  readonly key: string;
}
```

The source key may represent:

- normalized tag ID;
- runtime variable ID;
- runtime namespace plus key;
- another established runtime identifier.

The Binding Engine must not interpret transport-specific connection strings.

Do not persist:

```text
mqtt://...
opc.tcp://...
modbus://...
username
password
token
certificate
```

inside binding definitions.

Protocol-specific resolution belongs to Phase 9 data-source integration.

---

# 16. Runtime value model

The engine should consume values that can include:

```ts
interface RuntimeDataPoint {
  readonly value: JsonValue;
  readonly quality?: RuntimeQuality;
  readonly timestamp?: number;
}
```

Actual contracts should reuse current Runtime Engine types.

The engine must account for:

- present value;
- missing value;
- stale value;
- uncertain quality;
- bad quality;
- unsupported value type;
- invalid timestamp where relevant.

Quality behavior must be explicit.

A binding must not silently treat all bad-quality values as valid values.

---

# 17. Evaluation context

Conceptual evaluation context:

```ts
interface BindingEvaluationContext {
  readonly revision: number;
  readonly timestamp: number;
  readonly values: RuntimeValueReader;
  readonly locale?: string;
  readonly timezone?: string;
  readonly variables?: Readonly<Record<string, JsonValue>>;
  readonly functions?: SafeFunctionRegistry;
}
```

The context must:

- be readonly;
- expose only approved values;
- avoid arbitrary global access;
- avoid mutable service objects;
- be deterministic for the same inputs;
- support testing without browser APIs.

Time-dependent behavior must use context-provided time rather than calling `Date.now()` throughout the evaluator.

---

# 18. Binding result

Conceptual result:

```ts
interface BindingEvaluationResult {
  readonly bindingId: string;
  readonly status: BindingResultStatus;
  readonly value?: JsonValue;
  readonly diagnostics: readonly BindingDiagnostic[];
  readonly dependencies: readonly BindingDependency[];
}
```

Possible statuses:

```text
RESOLVED
FALLBACK
SKIPPED
UNRESOLVED
ERROR
```

The result must distinguish:

- successful resolution;
- fallback resolution;
- disabled binding;
- missing dependency;
- invalid input;
- expression failure;
- target-type mismatch.

Recoverable errors should not require exceptions.

---

# 19. Resolved output model

The engine must produce renderer-neutral results.

Possible output structures:

```ts
interface ResolvedBindingPatch {
  readonly entityId: string;
  readonly property: string;
  readonly value: JsonValue;
}
```

Or grouped state:

```ts
interface ResolvedEntityBindingState {
  readonly entityId: string;
  readonly properties: Readonly<Record<string, JsonValue>>;
}
```

The chosen design must:

- preserve deterministic order where relevant;
- support incremental patches;
- avoid DOM details;
- avoid renderer-specific classes;
- identify removed or reset resolved properties;
- support comparison with previous results;
- support runtime revision tracking.

---

# 20. Expression engine requirements

The expression engine must be safe by construction.

It must include a controlled:

```text
Tokenizer
    ↓
Parser
    ↓
AST
    ↓
Validator
    ↓
Dependency Extractor
    ↓
Evaluator
```

It must not pass arbitrary input to JavaScript execution.

---

# 21. Expression grammar

The exact grammar must be documented.

The initial grammar may support:

- numeric literals;
- string literals;
- boolean literals;
- null;
- value references;
- parentheses;
- unary operators;
- arithmetic operators;
- comparison operators;
- equality operators;
- boolean operators;
- conditional expressions if justified;
- approved function calls.

Recommended operators:

```text
Unary:
!
-
+

Arithmetic:
+
-
*
/
%
**

Comparison:
<
<=
>
>=

Equality:
==
!=
===
!==

Boolean:
&&
||

Optional:
??
?:
```

Do not add JavaScript language features without explicit need.

---

# 22. Expression prohibitions

The grammar must reject:

- assignment;
- mutation;
- loops;
- classes;
- object construction;
- imports;
- dynamic imports;
- function declarations;
- arrow functions;
- property prototype access;
- constructor access;
- `this`;
- `globalThis`;
- `window`;
- `document`;
- `process`;
- `require`;
- filesystem access;
- network access;
- arbitrary method invocation;
- arbitrary object traversal.

The engine must defend against expressions such as:

```text
value.constructor
value.__proto__
globalThis
window.location
Function("...")
eval("...")
```

---

# 23. Expression limits

The expression subsystem must enforce configurable limits.

At minimum:

- maximum expression length;
- maximum token count;
- maximum AST node count;
- maximum nesting depth;
- maximum function-argument count;
- maximum evaluation steps;
- maximum string output length where appropriate.

Limits must:

- have secure defaults;
- be documented;
- return typed diagnostics;
- avoid process crashes;
- avoid unbounded recursion.

---

# 24. Safe functions

Only explicitly registered functions may be called.

Initial safe functions may include:

```text
abs
min
max
round
floor
ceil
clamp
coalesce
isNull
isNumber
isString
isBoolean
```

Optional domain-neutral functions may include:

```text
average
sum
between
ifNull
length
lower
upper
substring
```

Every function must define:

- name;
- argument count;
- accepted types;
- return type;
- error behavior;
- determinism;
- complexity expectations.

Unsafe functions must not be registrable through untrusted document data.

Application-provided function extensions must pass through a trusted host boundary.

---

# 25. Type system

The Binding Engine must define a practical value-type system.

At minimum:

```text
NULL
BOOLEAN
NUMBER
STRING
ARRAY
OBJECT
```

Prefer restricting expression evaluation to:

```text
NULL
BOOLEAN
NUMBER
STRING
```

unless arrays or objects provide confirmed value.

Type behavior must be explicit for:

- arithmetic;
- comparison;
- equality;
- boolean coercion;
- string concatenation;
- null propagation;
- division by zero;
- non-finite numbers.

Avoid copying JavaScript coercion behavior blindly.

---

# 26. Numeric behavior

The engine must define:

- integer versus floating-point treatment;
- `NaN` policy;
- positive and negative infinity policy;
- division-by-zero policy;
- precision behavior;
- rounding behavior;
- numeric range limits.

Resolved numeric values must be finite unless a target explicitly permits otherwise.

Non-finite outputs should produce diagnostics and fallback behavior.

---

# 27. Missing-value behavior

Bindings must explicitly handle missing dependencies.

Supported policies may include:

```text
USE_FALLBACK
RETURN_NULL
SKIP_UPDATE
REPORT_ERROR
```

The default policy must be documented.

A missing value in one binding must not stop unrelated bindings.

---

# 28. Quality behavior

Bindings should support quality-aware evaluation.

Possible policies:

```text
ACCEPT_ANY
REQUIRE_GOOD
ALLOW_UNCERTAIN
USE_FALLBACK_ON_BAD
SKIP_ON_BAD
```

Quality values must reuse Runtime Engine contracts.

Quality must not be represented through renderer-specific colors inside the Binding Engine.

Instead, the Binding Engine may resolve semantic states such as:

```text
normal
uncertain
bad
offline
```

---

# 29. Direct binding semantics

Direct bindings must support:

- source lookup;
- missing source;
- quality policy;
- optional fallback;
- optional target type validation;
- optional safe conversion;
- dependency registration.

A direct binding should not require expression parsing.

---

# 30. Value coercion

Coercion must be limited and explicit.

Possible conversions:

```text
number → string
boolean → string
integer-like string → number
"true" / "false" → boolean
```

Implicit conversion should be disabled by default for security-sensitive or ambiguous targets.

Every coercion failure must be diagnosable.

---

# 31. Mapping definitions

Conceptual mapping:

```ts
interface ValueMappingEntry {
  readonly input: JsonValue;
  readonly output: JsonValue;
}
```

Mappings must define:

- comparison semantics;
- duplicate input handling;
- default output;
- unmatched behavior;
- target type validation.

Possible comparison modes:

```text
STRICT
CASE_INSENSITIVE_STRING
NUMERIC
```

Do not silently mix string `"1"` with number `1` unless explicitly configured.

---

# 32. Threshold definitions

Conceptual threshold:

```ts
interface ThresholdRule {
  readonly min?: number;
  readonly max?: number;
  readonly includeMin?: boolean;
  readonly includeMax?: boolean;
  readonly output: JsonValue;
}
```

Threshold validation must detect:

- invalid bounds;
- non-finite bounds;
- impossible ranges;
- overlapping ranges;
- ambiguous priority;
- duplicate ranges;
- invalid outputs.

The implementation must document whether:

- first match wins;
- highest priority wins;
- overlaps are prohibited.

Prohibiting ambiguous overlaps is preferred.

---

# 33. Threshold boundary behavior

Boundary behavior must be deterministic.

Tests must cover:

- exact minimum;
- exact maximum;
- inclusive minimum;
- exclusive minimum;
- inclusive maximum;
- exclusive maximum;
- no matching range;
- negative values;
- decimal values;
- very large finite values.

---

# 34. Formatting engine

Formatting must remain renderer-neutral.

It may support:

- number formatting;
- decimal precision;
- significant digits;
- grouping separators;
- percentage display;
- prefix;
- suffix;
- unit;
- boolean text mapping;
- date formatting;
- time formatting;
- date-time formatting;
- null placeholder;
- invalid-value placeholder.

Formatting should reuse platform-safe internationalization APIs through an isolated adapter where appropriate.

---

# 35. Locale behavior

Locale must come from:

- evaluation context;
- renderer context;
- application configuration;
- explicit binding definition where justified.

The engine must not assume a single locale.

Persisted numeric values must remain locale-neutral.

Formatting output may be localized.

Invalid locales must produce controlled fallback behavior.

---

# 36. Timezone behavior

Date and time formatting must define timezone ownership.

Timezone may come from:

- evaluation context;
- application configuration;
- explicit binding setting.

Do not use environment-local timezone implicitly for deterministic tests.

---

# 37. Color values

Color bindings should resolve semantic or validated color values.

Preferred output:

```text
semantic theme token
```

Examples:

```text
status.normal
status.warning
status.alarm
status.offline
process.active
process.inactive
```

Literal colors may be supported only through validation.

The Binding Engine must not generate:

- arbitrary CSS;
- style blocks;
- URLs;
- scriptable values.

---

# 38. Visibility values

Visibility bindings should resolve a renderer-neutral state.

Possible values:

```text
VISIBLE
HIDDEN
COLLAPSED
```

If only boolean visibility exists in current contracts, preserve compatibility.

The engine must define whether hidden entities:

- remain hit-testable;
- remain selectable;
- reserve layout space;
- affect connections.

Those broader behaviors may belong to renderer or designer policy.

---

# 39. Text values

Text bindings must return plain text.

The renderer must apply text through safe APIs such as `textContent`.

Binding output must not be treated as trusted HTML.

The Binding Engine must not produce arbitrary markup from runtime data.

---

# 40. Animation triggers

Phase 8 may resolve animation trigger state but must not implement animation scheduling.

Possible resolved outputs:

```text
active
inactive
start
stop
pulse
severity
speed
direction
```

Actual animation loops belong to Phase 10.

Binding outputs must remain data-only and renderer-neutral.

---

# 41. Binding validation

Validation must occur before binding execution where practical.

Mandatory validation layers:

```text
unknown binding input
        ↓
structural validation
        ↓
migration if required
        ↓
normalization
        ↓
semantic validation
        ↓
compiled binding definition
```

The Binding Engine may own binding-specific validation while the Core pipeline owns document-level orchestration.

---

# 42. Structural validation

Structural validation checks:

- object shape;
- discriminator;
- required fields;
- primitive types;
- collection types;
- valid JSON values;
- identifier shape;
- expression string type;
- mapping entry shape;
- threshold entry shape;
- formatting option shape.

---

# 43. Semantic validation

Semantic validation checks:

- binding ID uniqueness;
- target existence where document context is available;
- target property support;
- source reference validity;
- expression parse validity;
- expression dependency validity;
- mapping duplicate handling;
- threshold overlap;
- formatter option compatibility;
- fallback type compatibility;
- error-policy validity;
- unsupported binding cycles.

---

# 44. Normalization

Normalization may:

- default `enabled` to `true`;
- default empty metadata;
- canonicalize binding kinds;
- canonicalize source-key aliases;
- normalize threshold inclusivity;
- normalize formatting options;
- normalize error policies.

Normalization must not hide invalid semantics.

---

# 45. Compilation

Validated definitions may be compiled into an efficient internal form.

Compiled bindings may include:

- parsed AST;
- extracted dependencies;
- normalized mapping lookup;
- sorted threshold intervals;
- formatter instances;
- target metadata;
- evaluation plan.

Compiled forms are internal and must not be persisted.

Compilation must be deterministic.

---

# 46. Dependency model

Every binding must expose or produce its dependencies.

Dependency types may include:

```text
RUNTIME_VALUE
BINDING_RESULT
CONTEXT_VALUE
```

Initial implementation should prioritize runtime-value dependencies.

Conceptual dependency:

```ts
interface BindingDependency {
  readonly kind: BindingDependencyKind;
  readonly key: string;
}
```

---

# 47. Dependency extraction

Dependencies must be extracted from:

- direct source references;
- expression identifiers;
- explicit binding references;
- mapping input pipelines;
- threshold input pipelines;
- formatting input pipelines.

Dependency extraction must not require evaluating the expression.

---

# 48. Dependency index

The engine should create indexes such as:

```text
runtime key → binding IDs
binding ID  → dependency keys
entity ID   → binding IDs
```

Indexes must support:

- registration;
- document rebuild;
- incremental binding addition;
- incremental binding removal;
- incremental binding update;
- disposal.

---

# 49. Incremental reevaluation

When runtime values change, the engine should reevaluate only affected bindings.

Example:

```text
Changed keys:
- tank-01.level
- pump-02.running

Dependency index:
tank-01.level   → binding-a, binding-b
pump-02.running → binding-c

Reevaluate:
binding-a
binding-b
binding-c
```

Unrelated bindings must not be reevaluated.

---

# 50. Change input

Incremental evaluation should consume a renderer-neutral change set.

Conceptual:

```ts
interface RuntimeValueChangeSet {
  readonly revision: number;
  readonly changedKeys: readonly string[];
}
```

Or reuse an existing Runtime Engine change contract.

Avoid creating a duplicate authoritative runtime changeset if one already exists.

---

# 51. Result diffing

After reevaluation, the engine should identify:

- newly resolved properties;
- changed properties;
- unchanged properties;
- removed properties;
- fallback transitions;
- error transitions.

The result should allow downstream systems to avoid unnecessary renderer updates.

---

# 52. Equality policy

Resolved-result comparison must be deterministic.

The engine must define comparison for:

- numbers;
- strings;
- booleans;
- null;
- arrays if supported;
- objects if supported.

Prefer primitive outputs for bindable visual properties.

Avoid expensive deep equality in hot paths unless required.

---

# 53. Evaluation scheduling

The engine may support batched evaluation.

Potential flow:

```text
runtime changes
      ↓
aggregate changed dependencies
      ↓
identify affected bindings
      ↓
evaluate once per batch
      ↓
produce result changes
```

The Binding Engine must not create one independent event loop per binding.

Scheduling ownership must be explicit.

The Runtime Engine may own frame or microtask scheduling while the Binding Engine remains synchronously evaluable.

---

# 54. Cycle detection

If bindings may depend on other binding results, cycles must be detected.

Examples:

```text
binding-a → binding-b
binding-b → binding-a
```

and:

```text
binding-a → binding-b
binding-b → binding-c
binding-c → binding-a
```

Cycle handling must:

- produce typed diagnostics;
- isolate affected bindings;
- avoid recursion overflow;
- avoid blocking unrelated bindings;
- define fallback behavior.

If binding-to-binding references are not required in Phase 8, they should be prohibited rather than partially supported.

---

# 55. Error isolation

One failed binding must not prevent evaluation of other bindings.

Example:

```text
binding-a → expression syntax error
binding-b → resolves successfully
binding-c → missing source, uses fallback
```

The batch result must preserve all three outcomes.

The engine should catch only expected binding-domain failures.

Programming defects should not be silently swallowed.

---

# 56. Error model

Binding errors should use typed codes.

Recommended categories:

```text
BINDING_VALIDATION_ERROR
BINDING_SOURCE_NOT_FOUND
BINDING_BAD_QUALITY
BINDING_TYPE_MISMATCH
BINDING_EXPRESSION_SYNTAX_ERROR
BINDING_EXPRESSION_LIMIT_EXCEEDED
BINDING_EXPRESSION_EVALUATION_ERROR
BINDING_MAPPING_NO_MATCH
BINDING_THRESHOLD_NO_MATCH
BINDING_FORMAT_ERROR
BINDING_TARGET_ERROR
BINDING_DEPENDENCY_CYCLE
BINDING_UNSUPPORTED_FEATURE
```

Errors should include:

- code;
- message;
- binding ID;
- target context;
- dependency context where safe;
- severity;
- recoverability;
- cause where supported.

Sensitive runtime values must not be included by default.

---

# 57. Diagnostic model

Diagnostics may be:

```text
INFO
WARNING
ERROR
```

They should support:

- binding ID;
- document entity ID;
- source key;
- expression location;
- token range;
- recoverability;
- deduplication key.

Repeated failures should not create uncontrolled log spam.

---

# 58. Logging

Logging must be injectable or delegated through existing shared logging contracts.

The Binding Engine must not log directly to application-specific logging frameworks.

It must not log:

- credentials;
- tokens;
- protocol secrets;
- full imported documents;
- sensitive runtime values by default.

---

# 59. Immutability

Public inputs must be treated as immutable.

The Binding Engine must not mutate:

- binding definitions;
- `ScadaDocument`;
- runtime snapshots;
- runtime changesets;
- target metadata;
- caller-provided function registries.

Returned collections should be readonly where repository conventions permit.

---

# 60. Determinism

Given the same:

- compiled binding definitions;
- runtime values;
- runtime quality;
- timestamp context;
- locale;
- timezone;
- function registry;
- engine options;

the Binding Engine must produce equivalent results.

Nondeterministic APIs must not be called implicitly.

Examples of prohibited implicit nondeterminism:

- `Date.now()` inside expression evaluation;
- random number generation;
- environment locale without explicit context;
- environment timezone without explicit context;
- iteration over unstable object-key order where output order matters.

---

# 61. Serialization

Binding definitions must be JSON-safe.

Serialization must preserve:

- binding ID;
- binding kind;
- source references;
- target references;
- expression;
- mapping entries;
- threshold rules;
- formatting options;
- fallback;
- error policy;
- supported metadata.

Serialization must not include:

- parsed AST;
- compiled functions;
- dependency indexes;
- formatter instances;
- caches;
- diagnostics history;
- runtime values;
- resolved outputs.

---

# 62. Round-trip compatibility

The following must preserve meaning:

```text
BindingDefinition
      ↓ serialize
JSON
      ↓ parse
BindingDefinition
```

Tests must cover:

- every binding kind;
- optional fields;
- fallback values;
- mapping values;
- threshold boundaries;
- formatter options;
- metadata;
- legacy aliases where supported.

---

# 63. Migration

Persisted binding schema changes require migration.

Migrations must be:

- explicit;
- deterministic;
- ordered;
- tested;
- documented;
- compatible with the Core migration pipeline.

Do not silently rewrite:

- source IDs;
- target property names;
- binding kinds;
- expression identifiers;
- mapping semantics;
- threshold inclusivity.

Aliases may be used where appropriate.

---

# 64. Public API principles

Public APIs must:

- be intentional;
- use exported TypeScript types;
- avoid renderer-specific types;
- avoid browser-specific types;
- define ownership;
- define lifecycle;
- define error behavior;
- define mutability;
- define compatibility expectations;
- include tests and documentation.

Internal parser and cache structures should not be exported accidentally.

---

# 65. Suggested public engine contract

A conceptual engine contract may resemble:

```ts
interface BindingEngine {
  configure(
    definitions: readonly BindingDefinition[],
    context: BindingCompilationContext
  ): BindingConfigurationResult;

  evaluateAll(
    runtime: Readonly<RuntimeSnapshot>,
    context?: Readonly<BindingEvaluationOptions>
  ): BindingBatchResult;

  evaluateChanges(
    runtime: Readonly<RuntimeSnapshot>,
    changes: Readonly<RuntimeValueChangeSet>,
    context?: Readonly<BindingEvaluationOptions>
  ): BindingBatchResult;

  dispose(): void;
}
```

The actual API may differ if existing architecture supports equivalent responsibilities.

---

# 66. Engine lifecycle

The Binding Engine lifecycle must be documented.

Potential lifecycle:

```text
create
configure
compile
evaluate
update definitions
evaluate changes
dispose
```

After disposal:

- caches must be released;
- indexes must be cleared;
- subscriptions owned by the engine must be released;
- further evaluation should fail predictably or be prohibited.

The engine should not own external runtime subscriptions unless explicitly designed.

---

# 67. Definition updates

The engine should support controlled updates to binding definitions.

Possible operations:

```text
replace all
add
update
remove
```

Updates must correctly refresh:

- compiled definitions;
- dependency indexes;
- entity indexes;
- cached results;
- diagnostics.

A binding update must not require full engine recreation unless documented.

---

# 68. Runtime integration

The Runtime Engine should provide:

- immutable current snapshot;
- revision;
- changed runtime keys;
- normalized quality;
- normalized timestamps.

The Binding Engine should provide:

- affected resolved properties;
- diagnostics;
- result revision;
- optional performance metadata.

Neither engine should mutate persisted design state.

---

# 69. Renderer integration

The renderer must receive resolved values only.

The renderer must not:

- parse expressions;
- resolve runtime tags;
- apply threshold logic;
- apply mapping logic;
- format raw values;
- own dependency indexes;
- access protocol clients.

Renderer integration may consume:

```text
ResolvedSymbolVisualState
ResolvedConnectionVisualState
ResolvedBindingPatch
RuntimeVisualChangeSet
```

Use existing compatible contracts where available.

---

# 70. Symbol integration

Symbol metadata may declare bindable properties.

Example metadata:

```ts
interface BindablePropertyDefinition {
  readonly key: string;
  readonly valueType: BindableValueType;
  readonly defaultValue?: JsonValue;
  readonly runtimeWritable?: boolean;
}
```

The Binding Engine may validate targets against symbol metadata.

Generic symbol metadata must remain DOM-independent.

SVG visual implementations must not define authoritative binding semantics.

---

# 71. Designer integration

Phase 8 does not require full binding-editor UI.

However, contracts should support future designer capabilities:

- selecting binding kind;
- selecting runtime source;
- editing expression;
- adding mapping entries;
- adding threshold ranges;
- configuring formatting;
- showing validation diagnostics;
- previewing resolved values.

Designer UI must not embed an alternative binding evaluator.

---

# 72. Data-source integration boundary

Phase 9 data-source adapters will normalize external data into Runtime Engine values.

Phase 8 must not implement:

- MQTT connections;
- REST polling;
- WebSocket reconnect;
- OPC UA sessions;
- Modbus registers;
- credential storage;
- protocol-specific quality codes.

Phase 8 may define normalized expectations that Phase 9 adapters must satisfy.

---

# 73. Alarm boundary

Phase 8 may resolve a semantic severity or alarm-related property.

It must not implement:

- alarm acknowledgment;
- shelving;
- alarm history;
- alarm server state;
- alarm lifecycle processing.

These belong to dedicated alarm architecture.

---

# 74. Animation boundary

Phase 8 may resolve animation trigger data.

It must not implement:

- requestAnimationFrame scheduling;
- blinking timers;
- flow animation loops;
- transition interpolation;
- per-symbol animation controllers.

These belong to Phase 10.

---

# 75. Security requirements

The Binding Engine must:

- treat persisted binding definitions as untrusted input;
- validate all definitions;
- reject unsafe expression syntax;
- prohibit `eval`;
- prohibit `Function`;
- prohibit arbitrary global access;
- prohibit prototype traversal;
- enforce expression complexity limits;
- validate colors and strings;
- avoid untrusted HTML;
- avoid untrusted URLs;
- isolate plugin-provided extensions;
- avoid logging sensitive values;
- avoid resource exhaustion.

---

# 76. Denial-of-service resistance

Security tests must cover:

- extremely long expressions;
- deeply nested parentheses;
- excessive unary operators;
- large argument lists;
- repeated expensive functions;
- large mapping tables;
- large threshold lists;
- cyclic dependencies;
- repeated failing bindings;
- excessive output strings.

The engine must fail in a controlled manner.

---

# 77. Plugin extension boundary

Future plugins may contribute:

- safe functions;
- binding types;
- formatters;
- target metadata.

Plugin contributions must be:

- explicitly registered;
- host-controlled;
- versioned;
- validated;
- isolated where possible.

Untrusted document data must not register executable code.

---

# 78. Testing strategy

Phase 8 requires:

```text
Unit tests
Integration tests
Security tests
Serialization tests
Compatibility tests
Performance tests
Browser tests where integration requires browser behavior
```

Pure evaluation logic must not require browser tests.

---

# 79. Direct binding test matrix

Required cases:

- source exists;
- source missing;
- good quality;
- uncertain quality;
- bad quality;
- fallback defined;
- fallback absent;
- matching target type;
- type mismatch;
- disabled binding;
- null value;
- false value;
- zero value;
- empty string.

---

# 80. Expression test matrix

Required cases:

- numeric literal;
- string literal;
- boolean literal;
- null literal;
- source identifier;
- arithmetic;
- comparison;
- equality;
- boolean logic;
- parentheses;
- operator precedence;
- safe function call;
- invalid token;
- invalid syntax;
- missing dependency;
- type mismatch;
- division by zero;
- non-finite result;
- nesting limit;
- token limit;
- AST limit;
- blocked global access;
- blocked prototype access;
- blocked constructor access.

---

# 81. Mapping test matrix

Required cases:

- exact number match;
- exact string match;
- exact boolean match;
- null match if supported;
- unmatched input;
- default output;
- duplicate mapping input;
- strict comparison;
- configured case-insensitive comparison;
- target-type mismatch;
- serialization round trip.

---

# 82. Threshold test matrix

Required cases:

- below all ranges;
- above all ranges;
- exact inclusive minimum;
- exact exclusive minimum;
- exact inclusive maximum;
- exact exclusive maximum;
- gap between ranges;
- overlapping ranges;
- invalid minimum greater than maximum;
- equal minimum and maximum;
- negative values;
- decimal values;
- non-finite input;
- default output;
- serialization round trip.

---

# 83. Formatting test matrix

Required cases:

- integer formatting;
- decimal formatting;
- precision;
- significant digits;
- prefix;
- suffix;
- unit;
- percentage;
- locale;
- invalid locale;
- date;
- time;
- timezone;
- boolean labels;
- null placeholder;
- invalid-value placeholder;
- output-length limit.

---

# 84. Dependency test matrix

Required cases:

- one source to one binding;
- one source to multiple bindings;
- multiple sources to one binding;
- unrelated source change;
- shared dependency;
- binding add;
- binding update;
- binding removal;
- duplicate dependency;
- missing dependency;
- direct cycle if supported;
- indirect cycle if supported;
- deterministic dependency order.

---

# 85. Incremental evaluation test matrix

Required cases:

- changed source reevaluates affected binding;
- unchanged source does not reevaluate binding;
- multiple changes are batched;
- duplicate changed keys are deduplicated;
- changed output creates patch;
- unchanged output creates no patch;
- removed binding clears resolved result;
- fallback transition creates patch;
- error recovery creates patch;
- one binding failure does not block others.

---

# 86. Integration test matrix

Required integrations:

```text
Core document binding definitions
        +
Binding validation
        +
Runtime snapshot
        +
Binding evaluation
        +
Resolved runtime visual state
```

Test scenarios should include:

- node text binding;
- node visibility binding;
- semantic color binding;
- numeric gauge or level binding;
- connection active-state binding;
- expression using multiple runtime values;
- mapping from equipment state;
- threshold-driven warning state;
- incremental runtime update;
- renderer receiving resolved changes only.

---

# 87. Serialization tests

Serialization tests must verify:

- stable binding IDs;
- preserved source references;
- preserved targets;
- preserved expression strings;
- preserved mappings;
- preserved threshold boundaries;
- preserved formatting;
- preserved fallback;
- JSON-safe metadata;
- no compiled state serialized;
- no diagnostics serialized;
- no runtime state serialized.

---

# 88. Compatibility tests

Compatibility tests must cover:

- existing document schemas containing bindings;
- binding aliases;
- deprecated property names;
- previous runtime contracts;
- public API behavior;
- existing demos;
- existing renderer integration;
- round-trip compatibility.

No migration should be introduced without a fixture representing the old schema.

---

# 89. Performance scenarios

Representative scenarios:

```text
Small:
100 bindings
100 runtime values

Medium:
1,000 bindings
1,000 runtime values

Large diagnostic:
10,000 bindings
5,000 runtime values
```

Measure:

- validation;
- compilation;
- dependency indexing;
- full evaluation;
- single-value incremental update;
- multi-value batch update;
- result diffing;
- memory use;
- disposal.

Large scenarios are diagnostic unless release guarantees are explicitly defined.

---

# 90. Performance principles

The implementation should:

- parse expressions once;
- reuse compiled ASTs;
- pre-index dependencies;
- pre-normalize mappings;
- pre-sort valid thresholds where appropriate;
- cache formatters carefully;
- avoid full-document scans during small updates;
- avoid allocating excessive temporary objects;
- avoid deep cloning large runtime snapshots;
- avoid evaluating disabled bindings.

Optimizations must preserve correctness.

---

# 91. Benchmark reporting

Benchmark reports should include:

- environment;
- Node.js version;
- browser version where applicable;
- entity counts;
- repetitions;
- median;
- percentile where useful;
- memory observations;
- known limitations.

Avoid unstable strict CI timing assertions.

---

# 92. Documentation requirements

The Binding Engine package must document:

- purpose;
- responsibilities;
- package boundaries;
- public API;
- lifecycle;
- binding kinds;
- expression grammar;
- safe functions;
- type behavior;
- missing-value behavior;
- quality behavior;
- mapping behavior;
- threshold behavior;
- formatting behavior;
- dependency tracking;
- incremental evaluation;
- errors;
- diagnostics;
- security limits;
- serialization;
- integration examples;
- testing commands;
- performance notes;
- limitations.

---

# 93. Required architecture documents

Phase 8 should produce or update:

```text
docs/architecture/binding-engine.md
docs/architecture/binding-data-flow.md
docs/architecture/binding-dependency-graph.md
docs/architecture/runtime-binding-renderer-integration.md
docs/security/expression-engine.md
docs/testing/phase-8-binding-engine.md
docs/roadmap/phase-8-data-binding-engine.md
docs/audits/phase-8-audit.md
```

Use repository naming conventions if equivalent locations already exist.

---

# 94. ADR requirements

Create ADRs for decisions that are:

- cross-package;
- difficult to reverse;
- compatibility-sensitive;
- security-sensitive;
- performance-sensitive.

Likely ADR topics:

```text
Binding definition ownership
Expression grammar and evaluator
Binding target model
Dependency graph strategy
Incremental evaluation ownership
Runtime-to-renderer resolved-state contract
Plugin safe-function extension policy
```

Do not create redundant ADRs when existing ADRs already cover the decision.

---

# 95. Implementation order

Recommended Phase 8 implementation order:

```text
1. Inspect repository and capture baseline.
2. Inventory existing binding and runtime contracts.
3. Confirm package boundary and dependency direction.
4. Define binding contracts and diagnostics.
5. Implement validation and normalization.
6. Implement safe expression parser and evaluator.
7. Implement direct binding evaluation.
8. Implement mapping and threshold evaluation.
9. Implement formatting.
10. Implement compilation.
11. Implement dependency extraction.
12. Implement dependency indexes.
13. Implement full evaluation.
14. Implement incremental evaluation.
15. Implement result diffing.
16. Integrate with Runtime Engine.
17. Integrate resolved state with renderer contracts.
18. Add demos and examples.
19. Add security and performance tests.
20. Update documentation.
21. Run final audit.
```

---

# 96. Subphase boundaries

## Phase_8_00 — Foundation and Contracts

Must deliver:

- package baseline;
- contract inventory;
- binding definitions;
- target definitions;
- source definitions;
- result definitions;
- diagnostics;
- validation foundation;
- public exports;
- architecture documentation.

Must not implement the full expression engine.

## Phase_8_01 — Safe Expression Engine

Must deliver:

- tokenizer;
- parser;
- AST;
- expression validation;
- dependency extraction;
- safe evaluator;
- safe function registry;
- limits;
- security tests.

## Phase_8_02 — Binding Evaluation Core

Must deliver:

- direct bindings;
- expression bindings;
- evaluation context;
- fallback;
- quality policy;
- target type validation;
- failure isolation;
- batch result model.

## Phase_8_03 — Mapping, Threshold, and Formatting

Must deliver:

- mapping definitions and evaluator;
- threshold definitions and evaluator;
- formatter definitions and evaluator;
- validation;
- compilation optimization;
- tests.

## Phase_8_04 — Dependency and Incremental Evaluation

Must deliver:

- dependency index;
- affected-binding lookup;
- incremental reevaluation;
- result comparison;
- batching support;
- cycle policy;
- performance tests.

## Phase_8_05 — Runtime and Renderer Integration

Must deliver:

- Runtime Engine adapter;
- resolved visual-state generation;
- runtime revision coordination;
- renderer-neutral patches;
- symbol integration;
- integration demo;
- integration tests.

## Phase_8_06 — Final Validation and Audit

Must deliver:

- complete test matrix;
- compatibility audit;
- security audit;
- performance report;
- public API review;
- package-boundary review;
- documentation completion;
- Phase 9 readiness assessment.

---

# 97. Out of scope

The following are outside Phase 8 unless required to resolve a confirmed blocker:

- MQTT;
- OPC UA;
- Modbus;
- BACnet;
- REST polling;
- WebSocket reconnect;
- data-source credentials;
- alarm acknowledgment;
- alarm history;
- animation scheduling;
- full designer binding editor;
- plugin sandboxing;
- renderer-specific binding evaluation;
- arbitrary JavaScript execution;
- remote expression execution;
- server-side persistence infrastructure;
- collaboration;
- user authorization;
- access-control UI.

---

# 98. Prohibited implementation shortcuts

Do not:

- use `eval`;
- use `Function`;
- parse expressions with unsafe regular-expression substitution;
- allow arbitrary property traversal;
- mutate runtime snapshots;
- mutate document definitions;
- make the renderer evaluate bindings;
- place protocol clients in the Binding Engine;
- place SVG classes in public binding contracts;
- serialize ASTs as the authoritative source;
- rebuild every binding after one runtime value changes;
- silently ignore expression failures;
- silently coerce incompatible types;
- expose internal parser modules accidentally;
- duplicate existing authoritative contracts;
- rename existing public APIs for cosmetic consistency;
- rewrite earlier phases without evidence;
- disable lint or type-safety rules merely to pass.

---

# 99. Quality gates

At minimum, run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

When available and applicable:

```bash
pnpm test:integration
pnpm playwright test
pnpm benchmark
pnpm docs:build
pnpm api:check
```

If the repository uses different commands, discover and use the actual commands.

Do not invent unavailable scripts without updating package configuration intentionally.

---

# 100. Definition of Done

A Phase 8 feature is complete only when:

- implementation exists;
- public API is typed;
- public inputs are immutable;
- validation exists;
- errors are isolated;
- diagnostics are meaningful;
- tests exist;
- security constraints are tested;
- package boundaries are respected;
- documentation exists;
- lifecycle is handled;
- compatibility impact is understood;
- quality gates pass;
- audit evidence exists.

---

# 101. Audit checklist

The final Phase 8 audit must verify:

## Architecture

- Binding Engine is renderer-independent.
- Binding Engine is protocol-independent.
- Runtime state is not persisted into the document.
- Resolved state is renderer-neutral.
- No prohibited dependency direction exists.
- Existing contracts were reused where compatible.

## Security

- No `eval`.
- No `Function`.
- No arbitrary global access.
- No prototype traversal.
- Expression limits exist.
- Imported definitions are validated.
- Sensitive values are not logged.

## Correctness

- Direct bindings work.
- Expressions work.
- Mappings work.
- Thresholds work.
- Formatting works.
- Missing values follow explicit policy.
- Quality follows explicit policy.
- Target types are validated.
- Failures are isolated.

## Incremental behavior

- Dependencies are indexed.
- Affected bindings are identified.
- Unrelated bindings are not reevaluated.
- Unchanged outputs do not produce unnecessary patches.
- Binding updates refresh indexes correctly.

## Compatibility

- Serialized bindings round trip.
- Existing document fixtures still load.
- Existing renderer behavior is not broken.
- Public API changes are classified.
- Required migrations exist and are tested.

## Documentation

- Package README exists.
- Expression grammar is documented.
- Security constraints are documented.
- Integration examples exist.
- Known limitations are recorded.
- Phase 9 readiness is assessed.

---

# 102. Audit status format

Each audit entry must use:

```text
PASS
PARTIAL
FAIL
NOT_APPLICABLE
```

Each finding must include:

- requirement;
- status;
- evidence;
- test evidence;
- affected packages;
- severity;
- action;
- remaining risk.

---

# 103. Final implementation-agent instructions

Every Phase 8 implementation prompt must instruct the agent to:

1. Inspect the repository first.
2. Read the Master Specification.
3. Read this Phase 8 Specification.
4. Treat compatible existing code as valid.
5. Avoid duplicating authoritative contracts.
6. Preserve serialized compatibility.
7. Respect package dependency direction.
8. Treat binding definitions as untrusted.
9. Keep the expression engine safe.
10. Keep runtime and document state immutable.
11. Produce renderer-neutral outputs.
12. Implement only the current subphase scope.
13. Avoid speculative future-phase work.
14. Add tests alongside implementation.
15. Update documentation.
16. Run actual repository quality gates.
17. Report unresolved risks honestly.

---

# 104. Required final response format for implementation prompts

Agents implementing Phase 8 subphases should return:

```text
# Implementation Summary

## Repository Baseline
- inspected packages
- existing contracts reused
- compatibility classifications

## Changes Implemented
- files created
- files modified
- public APIs added or changed
- behavior delivered

## Architecture Decisions
- key decisions
- compatibility rationale
- ADRs added or updated

## Tests
- unit tests
- integration tests
- security tests
- performance tests
- commands executed
- results

## Documentation
- documents added
- documents updated

## Quality Gates
- format
- lint
- typecheck
- tests
- build
- browser tests
- benchmark
- API check

## Compatibility Impact
- serialized data impact
- public API impact
- migration requirements
- deprecated behavior

## Remaining Risks
- unresolved issues
- technical debt
- deferred work

## Phase Readiness
- current subphase status
- readiness for the next subphase
```

Do not claim commands passed unless they were actually executed.

---

# 105. Final architectural rules

Phase 8 must preserve:

```text
Binding definitions are persisted data.
Runtime values are transient data.
Resolved binding results are transient data.
Binding evaluation is renderer-independent.
Protocol clients do not live in Binding Engine.
Expressions never use unrestricted JavaScript execution.
One failed binding does not block unrelated bindings.
Small runtime changes produce small reevaluation sets.
Renderer receives resolved values only.
Serialized compatibility changes require migration.
Public contracts require tests and documentation.
```

---

# 106. Phase 8 final architecture

```text
                    ScadaDocument
                         │
                Binding Definitions
                         │
                         ▼
              Binding Validation Layer
                         │
                         ▼
              Binding Compilation Layer
         ┌───────────────┼────────────────┐
         │               │                │
  Expression AST     Mapping Index   Threshold Index
         │               │                │
         └───────────────┼────────────────┘
                         │
                Dependency Index
                         │
                         ▼
Runtime Snapshot ──→ Binding Evaluation Engine
                         │
                         ▼
               Resolved Binding Results
         ┌───────────────┼────────────────┐
         │               │                │
   Symbol State    Connection State   Target Patches
         │               │                │
         └───────────────┼────────────────┘
                         │
                         ▼
                  Renderer Contract
```

---

# 107. Phase 9 readiness criteria

Phase 8 is ready for Phase 9 when:

- normalized runtime values can be consumed without protocol knowledge;
- runtime source keys are stable;
- dependency indexes support changed-key updates;
- binding evaluation is deterministic;
- resolved results are renderer-neutral;
- expression execution is secure;
- binding definitions are serializable;
- errors are isolated;
- integration APIs are documented;
- no credentials are stored in documents;
- simulator-based integration tests pass;
- remaining limitations are documented.

---

# 108. Final instruction

Implement Phase 8 as an independent Data Binding Engine, not as renderer logic, protocol logic, or application UI logic.

Reuse compatible repository contracts.

Do not rewrite previous phases without a confirmed architectural blocker.

Optimize prompt size by treating this document as the shared specification for every Phase 8 subphase.
