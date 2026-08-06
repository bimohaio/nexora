# Connection flow animation

Phase 10.04 uses one ownership chain:

```text
persisted ConnectionFlowAnimation
→ RuntimeConnectionFlowManager
→ shared AnimationScheduler task
→ renderer-neutral ConnectionFlowSample
→ SvgConnectionFlowAdapter batch
→ cached overlay/marker attributes
```

The runtime owns phase and lifecycle. The scheduler owns time. The SVG adapter owns generated SVG only and never reads a clock. Binding Engine only converts resolved values. Neither preview nor runtime mutates `ScadaDocument`.

## Rendering and precedence

The visible base connection and hit path retain identity. Flow uses a sibling overlay with `pointer-events="none"`; moving glyphs use a bounded, reusable marker group. Visual precedence is base style, runtime quality, flow overlay, alarm overlay, then selection/hover. Alarm state travels with the sample but flow never replaces alarm visuals.

Dash offset is computed from the current sample: `directionSign × normalizedPhase × (dashLength + gapLength)`. It is never accumulated from a DOM value. Marker positions use wrapped normalized phase and deterministic spacing.

## Routes and cache

Current repository routes are direct, manual polyline and orthogonal polyline. They share the renderer's existing `d` path. The adapter caches the geometry signature and total length, invalidating only when `d` changes or `invalidateGeometry()` is called. Speed, color, direction and quality do not invalidate geometry. Bézier and branch routes are not present in current public contracts and remain not applicable.

## Lifecycle and policy

Hidden/offline/bad connections skip moving sampling and keep a static cue. Reduced motion freezes moving output. Removal and disposal clear overlays, marker pools, pending samples and cached DOM references. Cache ownership is per adapter instance, so equal connection IDs in separate viewers remain isolated.

SVG export policy is current-frame DOM when the exporter includes runtime overlays; exported content contains no scripts, handlers, callbacks or scheduler state.
