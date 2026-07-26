# Phase 12 — Import/export

## Goal

Provide user-facing, version-safe project import and export workflows.

## Scope

SCADA JSON files, package assets, compatibility reporting, migration UX, SVG or
image export boundaries, and failure recovery.

## Deliverables

Import/export services, file adapters, migration reports, export formats selected
by ADR, and demo workflows.

## Public APIs

Existing SCADA Core parse/serialize APIs remain authoritative for JSON. TODO:
asset-package and visual-export APIs require format and security decisions.

## Dependencies

SCADA Core validation/migration, Renderer for visual export, Designer Engine for
user workflows, and security limits.

## Testing

Round trips, supported migrations, invalid/future versions, large files, unsafe
assets, cancellation, and browser download/upload flows.

## Definition of Done

Users receive deterministic output and actionable diagnostics without bypassing
the SCADA Core import pipeline.

## Exit Criteria

Format ADRs, compatibility matrix, security review, and conformance fixtures pass.

See also:

- [Document lifecycle](../architecture/document-lifecycle.md)
- [Versioning and migrations](../architecture/versioning-and-migrations.md)
- [Security policy](../master-spec/security.md)
