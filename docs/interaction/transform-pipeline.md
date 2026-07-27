# Transform Pipeline

The move-only transform pipeline is deterministic and independently testable.

```text
screen -> viewport -> canvas -> world -> delta -> constraints -> temporary move transform
             CoordinateConversionService              TransformPipeline
```

`PointerEngine` and `CoordinateConversionService` reuse geometry package matrix and viewport
functions. `TransformPipeline` therefore consumes world positions without duplicating conversion.
It computes one shared delta for all sorted IDs, evaluates constraints in declaration order, and
emits a renderer-neutral transform. Local coordinates remain available from the pointer engine for
future parent/group adapters.
