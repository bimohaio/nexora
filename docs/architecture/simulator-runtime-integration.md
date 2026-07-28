# Simulator and runtime integration

Phase 9.02 adds a reference data-source adapter and a generic Runtime Engine
boundary:

```text
simulator -> datasource-core lifecycle/subscriptions -> normalized VALUE event
          -> generic runtime bridge -> mapped runtime batch -> existing store
          -> existing binding/visual scheduling -> renderer
```

`createDataSourceRuntimeIngestion` validates an explicit, collision-free
address-to-runtime-key mapping. Unmapped values are ignored with one
deduplicated diagnostic per address. It translates shared quality levels and
reasons, preserves source timestamps, metadata, source identity, and sequence,
and delegates stale/duplicate and revision semantics to the existing runtime
store. A batch retains only the latest event per runtime key, sorts keys
deterministically, and calls `updateMany` once. Thus a changed batch creates one
store revision; quality-only and timestamp-only changes remain observable.

`createDataSourceRuntimeBridge` is protocol independent. It subscribes only
through the adapter contract, coalesces events on an injected scheduler, and
isolates ingestion failures without changing adapter connection state. Its
states are created, starting, running, stopping, stopped, failed, and disposed.
Start, stop, and dispose are idempotent. Events are generation-checked, and
stop cancels queued work. Adapter ownership is explicit: `borrowed` is the
default; `owned` disconnects and disposes the adapter.

The runtime package owns conversion and state mutation. Binding evaluation and
renderer notification continue through existing Runtime Engine store
subscriptions. No protocol, DOM, credential, or document-schema dependency is
introduced.
