# Binding caching

Binding cache state is derived, non-persisted, and owned by an engine/coordinator instance.
`BoundedBindingCache` implements deterministic LRU eviction using insertion/access order. Capacity
defaults are 2,000 compiled artifacts and 10,000 runtime results; zero disables storage and invalid
or excessive capacities are rejected.

`CompiledExpressionCache` keys compilation by expression source, language version, every expression
limit, and an explicit function-registry revision. Registry owners must advance that revision after
semantic changes. Results and immutable ASTs are reusable; `clear` handles generation or document
replacement.

The coordinator stores only completed current-generation results, keyed by generation and runtime
revision. Runtime evaluation reuse itself remains precise through Phase 8.06 affected-subgraph
planning: unchanged dependency branches are not evaluated, and cached outputs include result
status, value, quality-derived diagnostics, and visual resolution metadata.

`createBindingDefinitionFingerprint` canonicalizes JSON-safe definitions with sorted object keys,
finite numeric checks, and a bounded depth before computing a compact deterministic fingerprint.
It does not execute user code. Fingerprints are cache identifiers, not cryptographic security
proofs.

Statistics are immutable snapshots containing hits, misses, invalidations, evictions, current and
peak size, and capacity. Mutable maps are never exposed. Cache failure must be treated as a
performance loss; callers can clear or bypass the cache without changing evaluation semantics.
