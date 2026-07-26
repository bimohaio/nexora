# Dependency rules

Dependencies point from adapters toward domain foundations. Core imports no browser, transport, renderer, engine, or UI API. Geometry is DOM-independent and may use only shared. Runtime never imports designer; designer never imports Web Components. UI calls engine APIs, and renderers do not mutate documents. Root ESLint restrictions enforce these boundaries.
