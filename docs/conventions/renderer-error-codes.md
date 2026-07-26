# Renderer error codes

Stable codes are `RENDERER_NOT_MOUNTED`, `RENDERER_ALREADY_MOUNTED`, `RENDERER_DISPOSED`, `RENDER_TARGET_INVALID`, `SYMBOL_RENDERER_NOT_FOUND`, `NODE_ELEMENT_NOT_FOUND`, `CONNECTION_ELEMENT_NOT_FOUND`, `PORT_RESOLUTION_FAILED`, `SVG_ELEMENT_CREATION_FAILED`, and `RENDER_DOCUMENT_FAILED`.

Lifecycle/programming errors throw `RendererError`. Recoverable per-entity problems emit events or logger warnings and continue rendering a safe fallback where possible.
