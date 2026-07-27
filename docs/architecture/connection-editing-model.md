# Connection Editing Model

Connections retain Core endpoint references and document-space waypoints.
Designer operations insert a waypoint on the nearest projected route segment,
move or remove a waypoint by index, normalize duplicate/collinear points, and
reassign a source or target endpoint.

The Symbol Registry resolves port positions and Core semantic validation remains
the compatibility authority. Invalid, hidden, locked, missing, or incompatible
targets leave the document unchanged. Preview/session state is transient and
does not create waypoint commands during pointer movement.

See also:

- [Advanced Editing architecture](advanced-editing-engine.md)
- [Connection model](../data-model/connection.md)
- [Symbol ports](../data-model/port.md)
