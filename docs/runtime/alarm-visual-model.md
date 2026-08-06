# Alarm visual model

Phase 10.06 converts Phase 10.05 `AlarmAggregate` values into immutable
`AlarmPresentation` contracts. It never evaluates conditions, selects an effective alarm, ranks
severity, or accesses a data source. `AlarmVisualResolver` is the presentation authority.

The contract contains semantic badge, overlay, border, fill, icon, text, animation and decoration
requests. It deliberately contains no SVG attributes, DOM nodes, Canvas operations, CSS values,
HTML, or Web Component types. Renderers choose how to realize each request.

Symbol, connection, group, layer and document presentations share the same model. Connections add
communication-loss, flow-interruption, critical-highlight, warning-overlay and pulse requests.
