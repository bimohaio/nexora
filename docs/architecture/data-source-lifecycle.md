# Data-source lifecycle and subscription ownership

## Decision

`@web-scada/datasource-core` owns protocol-independent lifecycle orchestration, retry policy,
scheduling contracts, and managed subscriptions. An adapter composition root creates a lifecycle
controller and a subscription manager, then supplies protocol callbacks. Runtime Engine, Binding
Engine, and renderers consume only normalized events and never own protocol clients.

This extends the Phase 9.00 package instead of creating a second state machine, scheduler in
Runtime Engine, or unrelated error hierarchy.

## State and concurrency

The controller stores one authoritative state. `idle`, `connecting`, `connected`,
`disconnecting`, `disconnected`, `reconnecting`, `failed`, and terminal `disposed` use the
transition table in `lifecycle.ts`. Every public transition creates a frozen status snapshot with
a deterministic revision, scheduler timestamp, generation, and attempt counters.

Only one connect and one disconnect promise can be authoritative. Same-kind overlapping calls
coalesce. Connect during disconnect queues behind it. A generation increments before new
connection ownership, disconnect, and disposal. Late operations compare their captured generation
before changing state; stale successful connections are cleaned up. Adapter operations observe an
`AbortSignal`.

Optional timeouts and reconnect delays share `DataSourceScheduler`. Every scheduled task has one
owner and is cancellable. Explicit disconnect and disposal cancel reconnect. Unexpected loss and
retryable connect failure use bounded exponential backoff. Retry attempts are one-based, finite by
default, and jitter randomness is injectable.

## Subscriptions

The manager owns logical intent, consumer handles, listener sets, activation cancellation, and
private transport handles. Normalization copies and freezes requests, sorts addresses, and uses a
canonical structural key. Deduplication shares only structurally equal descriptors; disabling it
creates an independent entry. Each consumer increments ownership once, each idempotent unsubscribe
decrements once, and the final owner closes transport once.

Disconnected registration remains pending. Loss suspends intent and invalidates the transport
generation. Connected status activates pending entries or restores suspended entries in
deterministic insertion order. Restoration failures are isolated per entry. Delivery is
synchronous in listener registration order; exceptions and rejected async results are diagnosed.
Generation checks reject stale callbacks.

## Resource ownership and security

- Lifecycle controller: active operation abort signal, connect/disconnect promise, reconnect timer,
  status listeners, and connection generation.
- Subscription manager: lifecycle listener, intents, consumers, activation signals, and transport
  subscription handles.
- Consumer: one logical handle and listener.
- Protocol adapter: concrete client/session and native cleanup.

Public diagnostics contain safe codes and identifiers only. Native causes remain non-enumerable in
`DataSourceError` and are not copied into status. Credentials, authenticated URLs, headers,
certificates, and protocol objects are forbidden.

## Limitations and Phase 9.02 readiness

Restoration currently starts entries independently and has no configurable concurrency limit.
Listener delivery is synchronous, so slow user code can delay later listeners even though it
cannot corrupt ownership. Protocol adapters must make connection cleanup safe to call for stale
generations. These constraints are explicit and do not block simulator adapter integration in
Phase 9.02.
