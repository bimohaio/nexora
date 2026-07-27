# Deterministic runtime simulator

## Purpose and boundary

`createRuntimeSimulator` exercises the public canonical ingestion path:

```text
RuntimeSimulator
      |
      | updateMany (one batch per tick)
      v
Runtime Engine / Store
      |
      v
Snapshot + ChangeSet -> Visual Resolver -> Renderer
```

The simulator depends only on `RuntimeUpdateSink`; it never imports a renderer,
mutates a `ScadaDocument`, or accesses SVG elements. The simulator is not a
protocol adapter, historian, or plant physics engine.

## Lifecycle

- `tick()` performs one deterministic manual tick.
- `start()` schedules recurring ticks using the injected scheduler.
- `pause()` cancels the pending timer while preserving state.
- `resume()` continues scheduling.
- `stop()` cancels scheduling.
- `reset()` restores tick zero and the original pseudo-random seed.
- `dispose()` is idempotent, cancels pending work, and rejects later operations.

Repeated `start`, `pause`, and `resume` calls never create more than one pending
timer.

## Determinism

The scenario receives `{ tick, now, random }`. `now` comes from the injected
`RuntimeScheduler`; `random` comes from a small seeded generator. Tests can
combine a manual scheduler with `tick()` and do not depend on `Date.now()` or
`Math.random()`.

The built-in industrial scenario emits seven stable keys for a tank, pump,
valve, pressure sensor, temperature sensor, and process connection. Ticks
20–24 use uncertain/stale quality, ticks 25–28 use bad/disconnected quality,
and tick 29 recovers to good quality. Every point contains a source timestamp,
sequence, and `runtime-simulator` source identity.

## Atomicity

Each tick calls `sink.updateMany` once. With the runtime store, all values
validate before mutation, commit at one revision, produce one change set, and
notify subscribers once. A rejected batch cannot partially update runtime
state.
