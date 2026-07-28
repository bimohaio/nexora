# Data Source Core

`@web-scada/datasource-core` defines the protocol-independent boundary between untrusted external
inputs and runtime ingestion. It owns adapter identity, capabilities, permissions, lifecycle
states and orchestration, reconnect policy, shared subscription ownership, point addresses,
normalized values and events, operation contracts, typed errors, and deterministic
validation/normalization.

It does not connect to networks, resolve credentials, mutate the runtime store, evaluate bindings,
or render UI. Protocol adapters supply connection and subscription transport callbacks.

## Public model

- `DataSourceAdapter` has a stable immutable identity, explicit capabilities and permissions,
  lifecycle methods, status inspection, and typed protocol-neutral operations.
- `DataPointAddress` maps a source and point key (plus optional namespace/path/extensions) to an
  unambiguous key with `dataPointAddressKey`. Runtime integrations decide how that key maps to the
  Runtime Engine's canonical tag key.
- `DataPointValue` contains a JSON-safe value, canonical quality, optional source time, mandatory
  receive time, and optional sequence/metadata/diagnostics.
- `DataSourceEvent` is a renderer-neutral discriminated union: `VALUE`, `STATUS`, `ERROR`,
  `DIAGNOSTIC`, or `METADATA`.
- Batch read/write results retain per-point success and failure.

All timestamps are non-negative Unix epoch milliseconds interpreted as UTC instants. Strings and
seconds are rejected; missing source time is not replaced and produces a diagnostic. Receive time
is supplied explicitly by the caller, making normalization deterministic and testable.

Quality rank from best to worst is `GOOD`, `UNCERTAIN`, `UNKNOWN`, `BAD`. Missing or unrecognized
quality is conservatively `UNKNOWN`; adapters should map raw protocol status first and may preserve
a safe raw identifier in `DataQuality.code`.

## Lifecycle, reconnect, and failures

`createDataSourceLifecycleController` is the authoritative connection state owner. The initial
state is `idle`; `disposed` is terminal. A monotonically increasing generation invalidates stale
connections, timers, notifications, and cleanup. Concurrent connects and disconnects are
coalesced; connect while connected and disconnect while disconnected are idempotent. A connect
requested during disconnect waits. Explicit disconnect cancels reconnect and never schedules a
new one. Disposal aborts current work, cancels timers, attempts transport cleanup, and is
idempotent.

The valid transitions are centralized in `lifecycle.ts`. Status snapshots are frozen, revisioned,
and timestamped using `DataSourceScheduler.now()`. Status listeners are synchronous and ordered by
registration; each exception is isolated. Protocol callbacks receive an `AbortSignal`. Optional
connect/disconnect timeouts use the same cancellable scheduler and late completion cannot regain
authority.

`createExponentialReconnectPolicy` uses one-based retry attempts and
`min(maxDelay, initialDelay * multiplier ** (attempt - 1))`. Jitter is symmetric, bounded, and
accepts an injected `RandomSource`. Retries are finite by default. Access, configuration,
validation, unsupported-operation, parse, normalization, and disposal errors do not retry by
default. Successful connection and explicit connect/disconnect reset retry counting.

## Managed subscriptions

`createSubscriptionManager` separates logical intent from the transport handle. Registration while
disconnected is deferred. Equivalent requests are normalized into a deterministic structural key;
address order is not significant. Deduplication is enabled by default and may be disabled.
Transport-affecting options and metadata are part of identity, while request IDs and listeners are
not.

Each consumer owns an independent idempotent handle. Equivalent consumers share one transport
subscription; the last consumer deactivates it exactly once. Connection loss aborts activation,
invalidates the transport generation, and retains intent as suspended. The next connected
generation restores each active intent independently. Closed consumers never restore, stale
events are ignored, and listener failures cannot block other listeners. Async listener promises
are not awaited but rejection is consumed and diagnosed.

The adapter composition root owns both managers and wires the lifecycle controller into the
subscription manager. The lifecycle does not own subscriptions, avoiding circular ownership.
Manager disposal removes its lifecycle listener, aborts activation, closes all handles, attempts
every transport cleanup, and remains terminal even if cleanup fails.

Adapter implementations expose every protocol-neutral operation method. Unsupported methods reject
with `DATASOURCE_UNSUPPORTED_OPERATION` after `assertOperationAllowed`; permission denial is
`DATASOURCE_ACCESS_DENIED`. Invalid public runtime input throws `DataSourceError`. Transport-wide
failures reject with a typed error, while batch item failures remain in operation results. Stream
failures use `ERROR` events. Listener exceptions must be isolated by adapter implementations.

## JSON and security policy

Normalization accepts only null, booleans, strings, finite numbers, arrays, and plain objects.
Undefined, non-finite numbers, bigint, binary values, dates, maps, sets, class instances, symbols,
functions, accessors, and cycles are rejected without string conversion. Defaults limit nesting to
32, arrays and object keys to 10,000, and strings to 1,000,000 characters. Outputs are copied and
structurally frozen; inputs are never mutated.

Identity, address, metadata, diagnostics, errors, and requests must never contain credentials,
tokens, authentication headers, certificates, private keys, secret URLs, or native protocol
objects. `DataSourceError.cause` is non-enumerable and omitted from `toJSON`. Secret resolution is
an application/deployment responsibility; live adapter state is never part of `ScadaDocument`.

## Adapter-authoring sketch

```ts
import {
  assertOperationAllowed,
  validateReadRequest,
  type DataSourceAdapter
} from "@web-scada/datasource-core";

async function read(adapter: DataSourceAdapter, request: Parameters<DataSourceAdapter["read"]>[0]) {
  assertOperationAllowed("read", adapter.capabilities, adapter.permissions);
  validateReadRequest(request);
  return adapter.read(request);
}
```

Tests run with `pnpm test packages/datasource-core`. Package build/typecheck use the root quality
gates. `SystemDataSourceScheduler` is the production timer boundary; tests inject a manual
scheduler. Later phases own protocol-specific mapping and transport clients.
