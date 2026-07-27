# Interaction accessibility

Accessibility state is derived from the same immutable document and selection state
used by interaction. The Designer accessibility adapter creates the graphics
document, groups, symbols, and connections; the SVG adapter owns ARIA projection.

Focus synchronization excludes hidden, locked, disabled, and decorative targets.
Selection is reflected with `aria-selected`; accessible names use explicit names,
metadata, symbol fallback names, and finally stable IDs. Announcements use a queued
live region. High-contrast and reduced-motion preferences are observed by the host
and passed as state, keeping media-query and DOM dependencies out of the engine.

Browser coverage verifies graphics roles, names, selection, focus projection, polite
announcements, forced colors, and reduced motion. Text is assigned through safe DOM
APIs; interaction metadata is never interpreted as HTML.
