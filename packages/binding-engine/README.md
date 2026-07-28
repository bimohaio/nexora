# Binding Engine

## Runtime and renderer integration

Applications may own a `RuntimeBindingRendererIntegration` to connect a normalized Runtime Engine
store to any renderer implementing `renderRuntimeChanges(snapshot, diff)`. Constructing the
integration performs no background work: call `start()`, use `flush()` for deterministic tests,
and call `dispose()` when the runtime session ends. `attachDocument()` coherently resets binding
caches for a replacement document, while `attachRenderer()` supports late-mounted renderers.

The integration publishes renderer-neutral, immutable snapshots only. It does not mutate the
document, expose binding caches, access DOM APIs, or dispose an attached renderer.

The package also owns renderer-neutral visual property resolution. See
[`docs/runtime/visual-property-resolution.md`](../../docs/runtime/visual-property-resolution.md)
for targets, supported properties, precedence, fallbacks, security rules, and incremental diffs.

The package evaluates direct and safe-expression sources and provides deterministic
exact-value mapping and number/text/boolean formatting. Persisted Core fields run
in the fixed order `transformation -> formatter -> target validation`.

See [the mapping and formatting reference](../../docs/runtime/value-mapping-and-formatting.md)
and [the pipeline decision](../../docs/architecture/deterministic-binding-transform-pipeline.md).

`@web-scada/binding-engine` defines renderer-neutral contracts for future data-binding
evaluation. Core remains the owner of persisted `PropertyBinding` definitions and the
document pipeline; Runtime Engine remains the owner of runtime values and snapshots.

The package currently provides:

- aliases for Core's persisted binding contracts;
- owner, dependency, diagnostic, and evaluation-result contracts;
- deterministic dependency keys and normalization;
- structural/semantic binding validation helpers;
- immutable-compatible definition normalization;
- isolated binding-type registries with aliases and duplicate protection.
- a lifecycle-bound evaluation coordinator with immediate, deferred, and manual scheduling;
- latest-revision request coalescing, generation tokens, cancellation, and disposal;
- bounded deterministic LRU caches and an expression compilation cache;
- binding-level failure isolation with keep-last-valid visual behavior.

It does not schedule renderer frames, mutate renderer state, access the DOM/network, or own
runtime values. Expression strings remain inert document data.

```ts
const registry = new BindingTypeRegistry();
registerDirectBindingType(registry);

const result = evaluateDirectBinding(binding, {
  runtime: runtimeSnapshot,
  timestamp: runtimeSnapshot.timestamp
});
```

The persisted discriminator vocabulary remains Core's compatible `source.type` union:
`tag`, `variable`, `constant`, and `expression`. Changing it would require a schema
migration, so Phase 8.00 does not introduce a second persisted `type` field.

Direct evaluation supports persisted `tag` sources. It uses strict typing for known boolean,
numeric, text, and connection-style targets. `good` and `uncertain` qualities resolve by
default; `bad`, `offline`, and `unknown` use an explicit compatible fallback or remain
unresolved. Optional maximum age provides deterministic stale rejection. No value coercion
is performed.

Expression bindings use the inert `expression` source and `scada-expression-v1`. The
package provides tokenizer, parser, readonly AST, compiler, dependency extraction,
allowlisted pure functions, bounded AST evaluation, binding evaluation, and registry
integration. See `docs/runtime/safe-expression-language.md` for the grammar and security
model. No JavaScript execution or ambient global lookup is used.

## Production readiness

The Phase 8 integration, performance, security, API, and lifecycle audits are collected in
[`docs/binding-engine`](../../docs/binding-engine/phase-8-final-audit.md). Run `pnpm benchmark` for
the required 100, 500, 1,000, 5,000, and 10,000 binding diagnostic matrix.
