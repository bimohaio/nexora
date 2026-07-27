# Dispatcher

```text
root capture -> ... -> parent capture -> target -> parent bubble -> ... -> root bubble
```

The propagation path is supplied root-first and must end in the event target.
Listeners are ordered by descending priority, then registration order. They may be
limited by event type, phase, and a predicate. `once` listeners remove themselves
after their first invocation. Removing listeners and disposing the dispatcher is
idempotent.

The dispatcher is synchronous once invoked. The manager's queue and injected
scheduler determine when dispatch begins and provide batching.
