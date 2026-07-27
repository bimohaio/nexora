# Pointer Lifecycle

```text
enter -> down -> move* -> up -> leave
                  \-------> cancel
```

Down optionally captures the pointer. Move replaces the tracked immutable snapshot and
calculates world-space movement from the previous snapshot. Up and cancel return their
final normalized state, release capture and remove tracking. Leave is normalized but
does not implicitly cancel an active captured pointer.

Wheel, click, double-click and context-menu use the same `PointerInput` envelope and
coordinate conversion path. Consumers dispatch the normalized result through the
interaction dispatcher; this phase does not assign drag or gesture semantics.
