# Binding ownership and package boundaries

Core owns persisted binding definitions and document invariants. Binding Engine owns
binding-domain validation, dependency descriptions, diagnostics, registries, and future
evaluation result contracts. Runtime Engine owns values, quality, timestamps, revisions,
and snapshots. Renderers consume resolved renderer-neutral visual state and never
evaluate definitions. Designer Engine may edit persisted definitions through document
commands; applications own protocols, credentials, and security policy.

The dependency direction for Phase 8.00 is:

```text
Core persisted contracts
          ↑
Binding Engine contracts
          ↑
future runtime/designer/renderer integration
```

Binding Engine imports only Core's public API. It has no renderer, framework, DOM,
Node-only, protocol, or application dependency. Registry instances own private maps and
are never global singletons.

The existing persisted shape attributes ownership through controlled target references.
`getBindingOwner` exposes those references without duplicating entities. Resolved results
remain transient and can later feed the Runtime Engine's existing
`ResolvedSymbolVisualState` and `ResolvedConnectionVisualState`; they are never serialized.
