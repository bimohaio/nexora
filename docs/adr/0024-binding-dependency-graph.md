# ADR 0024: Instance-owned binding dependency graph

Status: Accepted

## Decision

The Binding Engine owns a derived, non-persisted dependency graph and result cache. Dependency
identity is case-sensitive and encoded with length-prefixed components. Expression dependencies
come from compilation artifacts. Canonical binding ID breaks topological ties.

Cycles are diagnosed and excluded as a subgraph; unrelated acyclic bindings remain executable.
Normalized outputs use exact structural equality, including status and diagnostics. Input and graph
revisions are monotonic within their owners, and stale input work is rejected. Evaluator instances
are single-owner and synchronous.

Binding-output edges are supported by graph contracts and algorithms, but are not inferred from
extensions or added to the current persisted schema. A future persisted derived-binding reference
requires an explicit Core schema migration.

## Consequences

Small runtime changes use a reverse-index traversal instead of scanning all definitions. Cached
state cannot leak between documents or evaluator instances. The graph can be reconstructed from
authoritative binding definitions, so no cache migration format is required. Renderer scheduling
and protocol subscriptions remain outside the package.
