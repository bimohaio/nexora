# Event Coalescing

Coalescing removes obsolete high-frequency state while preserving observable ordering.

- Pointer moves coalesce per pointer and target.
- Wheel and focus events coalesce per target.
- Pointer down/up/cancel and keyboard lifecycle events are never discarded.
- Scheduler `coalesceKey` replaces older pending work.
- `obsoleteKey` cancels an entire superseded work generation.

Coalescing happens before public event dispatch, reducing listener calls and intermediate state.
