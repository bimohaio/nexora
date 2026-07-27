# Interaction context

`InteractionContext` is a frozen dependency container for viewport, renderer,
document, designer state, runtime snapshot, hit tester, coordinate converter,
theme, and options. All fields are references supplied by the host.

The context does not mutate or synchronize those systems. Unknown reference types
avoid dependency inversion from the interaction foundation into current renderer,
designer, or runtime implementations. Typed integration facades can be supplied by
later packages.

Coordinates can be converted among screen, viewport, canvas, world, and local
symbol spaces through the injected `CoordinateConverter`.
