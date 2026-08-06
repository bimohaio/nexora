# Runtime visibility snapshot

`RuntimeVisibilitySnapshot` exposes immutable per-entity visibility, motion, contrast, viewport,
permission, accessibility and optimization state plus bounded aggregate diagnostics. Diffs contain
sorted changed and removed IDs. `composeVisibilitySnapshot` attaches these hints to the standard
Runtime visual snapshot without modifying renderer architecture.
