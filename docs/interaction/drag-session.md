# Drag Session

`DragSession` extends the interaction foundation's `InteractionSession`.

```text
idle --start--> active --commit--> committed --dispose--> disposed
                    \--cancel--> canceled --dispose-----> disposed
```

The session snapshots deterministic, sorted node IDs and immutable pointer state. Updates create
new state objects and temporary transforms; they do not clone or modify the document. Cancel and
dispose clear preview state. Commit creates at most one command and returns it to the host for
execution through its command/history controller.

State includes pointer ownership, initial/current world position, shared delta, anchor, viewport
revision, drag revision, dragged IDs, and the optional temporary move transform.
