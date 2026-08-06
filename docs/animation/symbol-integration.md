# Symbol animation integration

The production path is `Symbol metadata → SymbolAnimationController → primitive instance → SharedAnimationScheduler → TransientAnimationValueStore → renderer adapter`.

Symbols declare capabilities, targets, slots, parameters, timing, reduced-motion behavior and visibility behavior. They contain no clocks or DOM logic. Runtime bindings accept `enabled`, `speed`, `direction`, `duration`, `opacity`, `color`, `level`, and `flow`. Invalid inputs are isolated as typed diagnostics.

The SVG adapter caches `data-scada-part` targets, preserves element identity and base transforms, and applies composed samples in batches. Empty samples or removal restore base attributes. `document-hidden` pauses the scheduler; offscreen entities may be paused independently. Reduced motion follows each slot policy. Alarm meaning must also remain visible through existing alarm style and label channels.

Designer preview reuses `RuntimeAnimationManager` and exposes play, pause, resume, restart, stop, seek and speed override. Preview values are transient and never serialize into the document.

Built-in profiles cover motors, pumps, fans/mixers, lamps/beacons/indicators, valves, pipes, tanks/vessels, conveyors, encoders and matching composite families. Legacy target names are mapped to these profiles when possible.
