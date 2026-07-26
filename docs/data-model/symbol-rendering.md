# Symbol rendering

Generic `SymbolDefinition` remains DOM-free. Renderer-local `SvgSymbolRenderer` has `create` and `update` methods receiving a readonly document, node, dimensions through its transform, and precomputed runtime visual state.

The initial SVG adapter registry contains Rectangle, Text, Tank, Pump, Valve, Motor, Sensor, and Indicator Lamp. Properties use safe defaults for fill, stroke, stroke width, opacity, text, font size, labels, level, and state color. Unsupported types use an inspectable dashed fallback.
