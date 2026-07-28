# Binding Engine architecture

Core owns serialized `PropertyBinding` definitions. Runtime Engine owns values, quality, timestamps,
snapshots, and monotonic runtime revisions. Binding Engine owns safe evaluation, dependency planning,
visual-property resolution, execution coordination, and lifecycle-bound caches. Renderers own frame
scheduling and application of immutable visual diffs.

The coordinator flow is:

```text
immutable request → coalesced pending batch → injected scheduler
→ Phase 8.06 plan → cached/isolated evaluation → visual resolution
→ token validation → immutable outcome
```

No coordinator, scheduler handle, cache entry, generation, diagnostic counter, or execution report is
serialized into a SCADA document. No DOM, framework, protocol, application event bus, global mutable
cache, `eval`, or dynamic code generation is used.
