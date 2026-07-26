# Rendering architecture

The SVG-first boundary exposes lifecycle, full-document rendering, incremental change sets, resize, and viewport operations. A render context supplies a symbol registry and viewport. Renderers receive readonly design state and return render statistics; they never own or mutate domain data.

SVG is preferred for inspectability, accessibility, CSS styling, and DOM event integration. A complete implementation is deferred until Phase 1.
