# Renderer API

Status: implemented in `@web-scada/renderer-svg`.

The public API includes `createSvgRenderer`, `SvgRenderer`, renderer dependencies
and options, lifecycle and viewport operations, full and incremental rendering
using `DocumentChangeSet`, runtime-state refresh, entity lookup, renderer events
and errors, pure calculations, SVG symbol visual adapters, and related registries.

The Renderer consumes validated readonly documents. Parsing, binding evaluation,
application viewport ownership, and editing are not Renderer APIs.

See also:

- [Rendering architecture](../architecture/rendering-architecture.md)
- [Renderer lifecycle](../architecture/renderer-lifecycle.md)
- [Render invalidation](../data-model/render-invalidation.md)
