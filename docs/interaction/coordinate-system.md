# Interaction Coordinate System

Coordinates flow in one direction and are reversible:

```text
Screen --origin--> Viewport --pan/zoom--> Canvas --matrix--> World --matrix--> Local
```

`CoordinateConversionService` provides `screenToViewport`, `viewportToCanvas`,
`canvasToWorld`, `worldToLocal`, their inverse operations, plus `screenToWorld` and
`worldToScreen`. Viewport, affine matrix and inversion math comes from
`@web-scada/geometry`; invalid or missing transforms produce typed `CoordinateError`s.

The configuration is captured at construction time. Create a new service when a
viewport or document transform revision changes.
