# Selection engine

The selection engine is a renderer-independent layer built on normalized
interaction contracts.

```text
InteractionDispatcher -> SelectionController -> SelectionManager
                               |                     |
                           Hit tester             Policies
                                                     |
                                      State -> Events -> Observers
                                                     |
                                       Designer / overlay adapters
```

`SelectionController` consumes normalized interaction events and requests targets
through the Phase 7.00 hit-test abstraction. It never accepts DOM events. The
manager validates targets, calculates a deterministic transition, permits
observers to cancel it, replaces immutable state, and emits specific and general
events.

The engine does not render overlays or change `ScadaDocument`. The
`SelectionOverlayAdapter` contract exposes state to a future renderer. The
designer bridge maps node and connection targets into the existing designer
selection contract without replacing legacy editing behavior.
