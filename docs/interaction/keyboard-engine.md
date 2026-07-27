# Keyboard Engine

`KeyboardEngine` owns normalized key lifecycle state and coordinates navigation and command
routing. It has no dependency on DOM event classes, frameworks, documents, or renderers.

```text
KeyboardAdapter -> KeyboardEngine -> KeyboardCommandRouter
                         |                   |
                         v                   v
                  immutable state      NavigationEngine
                         |                   |
                         v                   v
                  render adapter         FocusEngine
```

`key-down`, `key-up`, composition start/end, and modifier-change inputs are supported. Pressed
keys, active key, modifiers, repeat status, composition status, timestamps, focus, navigation
direction, and revision are immutable snapshots. Disposal clears collaborators and renderer state.

`KeyboardAdapter` is the boundary for browser-like events. It copies only stable keyboard fields
and never exposes the source event to the engine.
