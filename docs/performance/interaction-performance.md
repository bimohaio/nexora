# Interaction Performance

Phase 7.06 optimizes scheduling and state delivery without adding interaction features.

```text
input -> coalescing queue -> priority scheduler -> batch
                                              |
                         +--------------------+--------------------+
                         v                    v                    v
                    incremental state    cached lookup       profiling
                         |
                         v
                     frame commit
```

Pointer moves, wheel events, and focus events are coalesced by pointer and target before dispatch.
Selection, drag, keyboard, focus, accessibility, and renderer APIs remain compatible. A 16 ms
default frame budget defers remaining non-critical work to the next host-scheduled frame.
