# Runtime dispatch

`RuntimeDispatcher` is the SVG-independent boundary between runtime producers and consumers.
`enqueue()` and `enqueueMany()` place updates in a `RuntimeUpdateQueue`; updates for the same
`symbolId` are shallow-merged while retaining first-insertion order. The latest state, visibility,
removal flag, and property value win.

The dispatcher schedules one delivery with `RuntimeFrameScheduler`. A burst therefore invokes its
`dispatch` callback once on the next animation frame. Updates added reentrantly are delivered on a
later frame. `flush()` is available for deterministic shutdown and tests, and `dispose()` cancels
pending work.

```ts
const dispatcher = new RuntimeDispatcher({
  dispatch: (updates) => runtimeView.apply(updates)
});
dispatcher.enqueue({ symbolId: "pump-1", properties: { speed: 1450 } });
```

The queue and dispatcher hold ephemeral data only and never receive or mutate a `ScadaDocument`.
