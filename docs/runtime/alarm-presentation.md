# Alarm presentation resolution

Pure public functions are `resolvePresentation`, `resolveBadge`, `resolveOverlay`,
`resolveBorder`, `resolveFill`, `resolveText`, `resolveAnimation`, and `resolveIcon`. Their only alarm
input is an already resolved aggregate.

Presentation status precedence is disabled, offline/unknown, maintenance/out-of-service,
suppression/shelving, acknowledged, active and normal. Within active presentation, the effective
severity supplied by Phase 10.05 selects semantic strength. No function recomputes severity.

`AlarmVisualPresentationStore.apply` consumes `AlarmSnapshotDiff`. It retains object identity for
unaffected scopes and emits an `AlarmVisualDiff` with sorted changed IDs. Stale alarm snapshots are
ignored.
