# Drag Engine

`DragEngine` is the renderer- and framework-independent coordinator for node movement. It owns
exactly one `DragSession`, accepts normalized `PointerState` values, and exposes start, update,
commit, cancel, and dispose operations.

```text
PointerEngine -> DragEngine -> DragSession -> TransformPipeline
                                      |             |
                                      v             v
                                transient preview  MoveNodesCommand
```

The engine never holds or mutates a SCADA document. The host supplies node snapshots, a move
command factory, optional policies and constraints, and a preview adapter. Pointer ownership is
enforced for the lifetime of a session. Starting or updating after disposal is an error.

Use `createDesignerDragEngine` in the designer package to connect the generic engine to
`ScadaDocument` and the existing command system.
