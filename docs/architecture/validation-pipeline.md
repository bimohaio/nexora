# Validation pipeline

Structural validation checks unknown object shape, primitives, arrays, finite numbers, positive dimensions, JSON safety, and nested required fields. Semantic validation checks version support, IDs, timestamps, references, parent cycles, transforms, symbols/ports, compatibility, connection limits, variables, and bindings.

Issues use JSON Pointer paths and stable codes. Warnings may coexist with success; errors and fatal issues make a result invalid. A symbol registry is injected through optional validation context.
