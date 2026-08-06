# Runtime symbol animation

Create one `RuntimeAnimationManager` per mounted runtime surface, pass the symbol registry, frame driver and optional time source, then call `loadDocument`. Use `onSamples` to forward composed values to the renderer adapter. Convert bindings with `toSymbolAnimationBindingInput` before `applyBinding`.

Lifecycle methods include document load/update, play, pause, resume, restart, seek, entity/document stop, visibility changes and dispose. Removing a node disposes its tasks and transient values. `dispose()` releases controllers, scheduler tasks and value-store entries. Runtime animation never mutates `ScadaDocument`.

Diagnostics distinguish missing symbols/slots/targets, invalid bindings, unsupported primitives, instance failures and renderer failures. Hosts should log them with entity and slot context while allowing unrelated animations to continue.
