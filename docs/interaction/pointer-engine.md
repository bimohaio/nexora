# Pointer Engine

`PointerEngine` is a framework-independent lifecycle tracker. Call `process()` with a
plain `PointerInput`; it returns a deeply immutable normalized event and retains the
latest state for active pointers. Up/cancel removes the pointer, and `dispose()` releases
all capture handles.

```text
platform event -> PointerInput -> PointerEngine -> immutable PointerState
                                      |
                                      +-> optional PointerCapture
```

The public input contains no DOM event. Mouse, pen and future touch adapters therefore
share one pipeline. Dragging and gesture interpretation deliberately sit outside it.
