# Keyboard Command Routing

`KeyboardCommandRouter` resolves commands and invokes registered handlers without containing
business logic.

```text
NormalizedKey -> KeyMap -> duplicate guard -> interaction guard -> handler
```

Routing respects composition and active interaction state. While another interaction is active,
only Escape is routed. A timestamp/code/command/repeat fingerprint prevents duplicate delivery.
Repeat events remain available for navigation. Handlers receive immutable keyboard state and
logical focus.

The dispatcher emits key, navigation, focus, command, and Escape events. Hosts can subscribe these
events into the wider interaction event flow. Commands never mutate `ScadaDocument` directly.
