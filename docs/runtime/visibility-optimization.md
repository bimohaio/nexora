# Visibility optimization

`resolveVisibility` combines explicit, layer, group, document, collapsed, disabled, occluded and
viewport state. Invisible entities request culling and pause animation, overlays, particles and
glow while retaining runtime state. `RuntimeVisibilityManager` updates only supplied entity IDs and
preserves identity for unaffected entries.
