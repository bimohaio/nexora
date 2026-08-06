# Connection flow test strategy

Unit tests cover runtime lifecycle, shared-scheduler ownership, direction/speed/quality updates, binding validation, serialization, plugin security, deterministic dash mapping, overlay isolation, marker pooling, geometry cache invalidation, batching, diagnostic bounds and disposal.

Stress coverage creates and disposes 1,000 controllers and sends 5,000 invalid diagnostic updates. The benchmark fixture measures a shared frame across 1,000 dash connections. Browser-only SVG curve sampling is deferred because the current route model emits line/polyline paths; pure path fallback logic is tested in happy-dom.
