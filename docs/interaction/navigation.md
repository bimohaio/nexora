# Keyboard Navigation

`NavigationEngine` converts navigation commands into logical focus traversal. When supplied a
`SelectionManager`, the focused target is selected with source `keyboard`.

```text
Arrow / Tab / Home / End / Page key
                  |
                  v
             NavigationEngine
                  |
          +-------+-------+
          v               v
      FocusEngine    SelectionManager
```

The default map treats right/down/Tab as next, left/up/Shift+Tab as previous, Home/Page Up as
first, and End/Page Down as last. Parent and child commands are public for custom maps. Pan, zoom,
and canvas transforms do not alter logical ordering; hosts rebuild targets when document or layer
visibility changes.
