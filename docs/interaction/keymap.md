# Key Map

`KeyMap` maps normalized chords to extensible command strings.

```text
modifiers + normalized key -> chord -> command
```

Legacy names such as `Esc`, `Left`, and `Spacebar` normalize to stable names. Bindings may be
global or restricted to macOS, Windows, or Linux. Applications can construct a map from custom
bindings or call `withOverrides` to replace defaults. Character keys normalize to lowercase;
modifier ordering is Control, Meta, Alt, Shift.

The default map includes arrows, Home, End, Page Up/Down, Tab, Shift+Tab, Escape, Enter, and Space.
Clipboard, history, editing, and application shortcuts are intentionally absent.
