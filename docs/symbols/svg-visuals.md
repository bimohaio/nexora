# SVG visuals

SVG implementations live only in `renderer-svg`. Each renderer creates a local root group and
supports targeted design/runtime updates and disposal. The registry performs O(1) lookup and rejects
duplicate visual types. `validateAgainst` audits generic/visual parity. The existing fallback keeps
bounds, transforms, selection metadata and the unresolved type visible.
