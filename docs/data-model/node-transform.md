# Node transform

Transforms contain x/y, positive width/height, finite rotation, and non-zero scale. Rotation is normalized into `[0, 360)`; early designers may expose quarter turns only. Ports transform around the node center in this order: normalized local point, center-relative scale, center-relative rotation, canvas translation.

See also:

- [Data-model index](README.md)
- [Master architecture](../master-spec/architecture.md)
- [Conventions](../conventions/README.md)
