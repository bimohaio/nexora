# @web-scada/symbols

Framework-neutral symbol/state/property/port metadata with a validating in-memory registry. Registration is deterministic, duplicates are rejected unless replacement is explicit, and returned collections are snapshots.

`createExampleSymbolRegistry()` registers metadata for Rectangle, Text, Tank, Pump, Valve, Motor, Sensor, and Indicator Lamp. SVG adapters remain in `@web-scada/renderer-svg`; the generic package contains no DOM code.
