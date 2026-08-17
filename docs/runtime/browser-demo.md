# Phase 10 Browser Demo

Start the integrated browser applications with:

```sh
pnpm dev:scada
```

Runtime runs on port 4173 and Designer on port 4175 in integrated mode. The Runtime sample selector
loads Water Treatment, Power Distribution, Factory Production Line, Building Management System or
Tank Farm scenarios. Each document uses the same validated Phase 10 capability fixture: live tag and
text bindings, symbol and connection animation, flow, alarm transitions, quality/offline behavior and
visibility controls.

Use Start/Stop and datasource controls for lifecycle and simulation, the animation controls for
playback/speed/reduced motion, the alarm panel for severity/theme/acknowledgment-style previews, and
Zoom/Pan/Fit for viewport validation. “Open in Designer” stops Runtime, transfers a serialized public
document contract to Designer and accepts a validated revision back.

The Phase 10 diagnostics panel reports FPS, average renderer event duration, last dirty entity count,
runtime revision, active animation slots, active alarms, SVG memory counters and renderer instance
count. These values are observational and never feed engine decisions.

Every application owns its subscriptions, animation scheduler, renderer and telemetry timer. Closing
or reloading the page disposes those resources. Multiple tabs therefore remain isolated.
