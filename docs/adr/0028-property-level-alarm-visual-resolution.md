# ADR 0028: Resolve alarm visuals per property

## Status

Accepted

## Context

Design, runtime, binding, alarm, animation, interaction and accessibility state may
all affect one entity without owning every visual property.

## Decision

Use per-target-property animation conflict resolution and a separate deterministic
alarm priority resolver. Alarm state can override emphasis while runtime still owns
text and interaction still owns selection overlays. Severity is semantic; themes
map tokens to concrete styles.

## Consequences

There is no central symbol-type or global-state-wins switch. Renderers consume
resolved state and never evaluate thresholds.
