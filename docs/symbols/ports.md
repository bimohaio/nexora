# Symbol ports

Ports use Core `PortDefinition` and normalized coordinates in `[0, 1]`. IDs are persisted connection
endpoints and must not be renamed. Registry registration rejects duplicate IDs, invalid coordinates
and non-positive connection limits. SVG geometry and callbacks do not belong in port metadata.
