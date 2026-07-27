# Interaction architecture

The interaction engine is a framework-, renderer-, and browser-independent package.

```text
Adapter -> Manager -> Queue -> Dispatcher -> Session / listeners
                       |            |
                    Scheduler    State store
                       \            /
                     Interaction context
```

Adapters normalize host input. The manager controls scheduling and ownership. The
dispatcher provides deterministic propagation, while sessions isolate future
multi-event operations. Context contains injected references only; it never owns
application state. Disposal flows from manager to queue, dispatcher, sessions, and
state subscriptions.

The package deliberately does not select, drag, resize, rotate, hit-test, or access
the DOM. Those capabilities are consumers of this foundation.
