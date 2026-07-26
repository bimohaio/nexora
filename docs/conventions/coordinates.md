# Coordinates

Documents use logical canvas coordinates, independent of display pixels. Port positions are normalized to `[0, 1]`. Viewports map logical coordinates to presentation. Geometry functions remain pure and DOM-independent. Phase 0 permits only 0°, 90°, 180°, and 270° node rotations and no skew.

See also:

- [Conventions index](README.md)
- [Dependency policy](../master-spec/dependency-rules.md)
- [Architecture](../architecture/README.md)
