# Visual property resolution

Phase 8.05 adds a renderer-neutral boundary between binding evaluation and runtime rendering.
It consumes `BindingEvaluationResult` values and produces immutable target property snapshots and
fine-grained changes. It never imports a renderer, accesses the DOM, or changes a `ScadaDocument`.

## Targets

Core remains the serialized source of truth. `BindingTarget` is normalized as follows:

| Persisted target      | Runtime target                                          |
| --------------------- | ------------------------------------------------------- |
| `node-property`       | `node / property`                                       |
| `node-state`          | `node / status`                                         |
| `connection-property` | `connection / property`                                 |
| `text`                | `node / text`                                           |
| `visibility`          | `node or connection / visible` (owner kind is required) |

Runtime keys use a kind and length-prefixed stable ID. Dotted or slashed paths are not traversed.
`__proto__`, `prototype`, and `constructor` segments are rejected.

## Built-in properties

The registry includes visibility, opacity, safe colors, text, status, numeric runtime values,
boolean state flags, direction, and animation triggers. Opacity is rejected outside `[0, 1]`;
stroke width and level are non-negative; level is limited to `100`; scale must be positive. Other
numeric values must be finite. Rotation follows the existing geometry convention and is not
rewritten.

Colors accept hex literals, restricted `rgb(a)`/`hsl(a)` literals, a small keyword set, or
`theme:name` tokens. Resource URLs and script-like CSS are rejected. Text remains an ordinary
string; consumers must render it as text, never HTML.

## Precedence and fallback

Candidates are ordered by:

1. larger explicit priority;
2. smaller serialized declaration order;
3. lexical binding ID.

An equal priority and equal/missing declaration order emits `CONFLICTING_VISUAL_BINDINGS`; the
binding-ID winner is retained. A successful value is used only when its property and target
validate. Otherwise the resolver uses, in order, a supplied design-time value and the descriptor
default. Evaluation-provided fallback values retain `fallback` status. Missing fallback is omitted
and remains invalid or unresolved; previous values are not silently retained.

## State, equality, and lifecycle

`VisualPropertyResolver.resolve()` creates a full immutable snapshot and a minimal change set.
JSON scalars compare by `Object.is` (`0` and `-0` differ); arrays and objects compare recursively
with sorted object keys. `null` differs from omission. Inputs and prior snapshots are never
mutated. Resolver registries, revisions, and snapshots are instance-scoped. `reset()` clears state;
there are no external resources requiring disposal.

Dependency selection remains the responsibility of the existing dependency index. Callers pass
only affected candidates when assembling their next input; the emitted changes contain only
changed target properties. Existing runtime visual snapshot contracts remain compatible and may
consume `properties` directly.

## Extension policy and limitations

Hosts may create an isolated `VisualPropertyRegistry` and register flat, JSON-valued properties.
Duplicate names, unsafe names, empty type sets, and empty target sets fail registration. Deep
merge, arbitrary CSS, symbol parts, layers, canvas targets, renderer resources, and animation
scheduling are deliberately unsupported.
