# Animation State Model

`AnimationDefinition` is shareable persisted design configuration.
`AnimationRegistration`, lifecycle, frame, sample, contribution and
`AnimationVisualState` are transient snapshots. A definition ID is never used as
the globally unique runtime instance ID.

Conflicts are resolved per entity, part and property. Higher priority wins; stable
registration order then instance ID break ties. This lets alarm opacity coexist
with runtime text and interaction overlays.
