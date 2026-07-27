# Interaction lifecycle

```text
create -> configure adapters -> mount renderer -> connect input
   -> normalize -> dispatch -> update immutable state -> render
   -> disconnect input -> cancel active session -> dispose -> release resources
```

Creation uses injected geometry, renderer, clock, policy, and diagnostics contracts.
Mounting belongs to the host renderer. Interaction engines remain usable without a
browser. During interaction, sessions own transient state and commands are committed
only at the terminal boundary. Selection, keyboard, focus, and accessibility replace
frozen snapshots rather than mutating published state.

Disposal is idempotent. The host disconnects browser listeners and media-query
listeners, then disposes accessibility, keyboard, queues, sessions, and the renderer.
Disposal clears subscribers, queued announcements, caches, focus targets, renderer
metadata, and active sessions. Calls that would revive a disposed engine fail with a
typed disposed error.
