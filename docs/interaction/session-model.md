# Session model

Sessions progress through `idle -> active -> committed|canceled -> disposed`.
`start`, `update`, `commit`, `cancel`, and `dispose` are explicit lifecycle hooks.
Only an active session accepts updates or commit.

`InteractionSessionManager` owns at most one session. Starting another cancels and
disposes the previous session. Committing or canceling always releases ownership
and disposes resources, including when a lifecycle hook throws.

Concrete drag, selection, resize, pan, rotate, marquee, and connection sessions are
intentionally deferred.
