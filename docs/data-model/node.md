# Node

A node references a stable symbol type and layer. Its transform stores logical x/y, positive dimensions, normalized rotation, and non-zero x/y scale. Properties and controlled metadata/extensions are JSON-safe design values. Binding IDs reference document bindings. Optional `parentId` forms grouping; semantic validation rejects missing parents, self-parenting, and cycles.
