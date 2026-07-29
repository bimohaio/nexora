# Core Animation Primitives

Core primitives are deterministic evaluators over normalized progress. They do not schedule,
render, read bindings, or mutate runtime/document state.

## Timing

Duration, start delay, end delay, and playback rate use milliseconds. Zero duration resolves
without division. Pause freezes local elapsed time; resume resets the time anchor so hidden or
paused wall time does not cause a jump. Finite repetition completes after its end delay; infinite
and until-cancelled repetition never auto-complete. Reverse is a timeline direction operation, not
a negative speed.

Fill controls transient value ownership: backwards owns the initial value before active time,
forwards owns the final value after active time, both does both, and none owns only active values.
Cancellation clears the current primitive result.

## Values

- Number: finite linear interpolation with exact endpoints and clamped progress.
- Integer: half-away-from-zero rounding.
- Boolean/string/enum/visibility: discrete threshold, default `0.5`.
- Opacity: scalar interpolation clamped to `[0, 1]`.
- Color: immutable RGBA, sRGB channels rounded to integers and alpha kept numeric.
- Angle: direct, shortest, clockwise, or counter-clockwise degree interpolation.
- Vector/matrix: finite component interpolation.
- Transform: decomposed translation, rotation, skew, and scale with stable defaults/order.

CSS parsing, transform-string construction, and renderer serialization are outside core.

## Extension and testing

Register custom interpolation and primitives in owner-scoped registries. Duplicate built-ins,
unknown IDs, incompatible factory results, callback failures, and non-finite values produce typed,
localized errors/diagnostics.

Use `ManualAnimationClock` and `ManualAnimationFrameDriver` for deterministic tests. Performance
fixtures assert stable output/counts rather than unstable wall-clock thresholds.

## Composite execution

Composites accept primitive or nested composite children. Parallel, sequence, stagger, delay-group,
race, barrier, and conditional execution use stable child order. Repeat supports once, finite
count, or infinite execution, with normal/reverse/alternate/alternate-reverse direction.

Conditional predicates receive only the composite ID and iteration. Retry uses a bounded attempt
count, scheduler-time delay, deterministic backoff factor, and optional fallback child. It never
allocates a timer. Stop-on-failure cancels siblings; continue/ignore isolate the failed child.

Pause freezes child offsets and retry deadlines. Seek, reverse, playback rate, cancellation, reset,
and disposal propagate top-down. `validateCompositeGraph` uses iterative identity-based traversal
to reject direct and indirect cycles without recursion limits.
