# Interaction integration

The integration boundary is deliberately narrow:

```text
Geometry <- Interaction Engine <- Designer adapters -> Designer commands
                                      |
                                      v
                              Renderer adapter contracts
                                      |
                                      v
                              SVG / Web Components
```

Pointer coordinates are converted once by the coordinate service before spatial
queries. Hit results become renderer-independent targets. Selection adapters
synchronize target snapshots with Designer state. Drag adapters create Designer
commands and never mutate renderer objects. Keyboard navigation updates focus and
selection through callbacks. Accessibility derives its tree from the same Designer
document and selection snapshot, then projects ARIA through an adapter. Renderer and
scheduler implementations receive immutable state and own all visual updates.

Integration invariants:

- hidden or locked layers cannot contribute selectable, draggable, focusable, or
  accessible nodes;
- target IDs and coordinate spaces cross boundaries, DOM elements do not;
- commands are the only persistent drag mutation path;
- selection changes precede accessibility projection;
- terminal input flushes or cancels transient work deterministically;
- each subscription, adapter, session, and renderer has one disposal owner.
