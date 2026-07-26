# Phase 03 — Symbol library

Status: complete.

## Goal

Expand generic industrial symbol metadata and SVG visuals without coupling symbols
to the DOM.

## Scope

Symbol taxonomy, metadata quality, industrial symbol set, port semantics, visual
adapters, states, documentation, and conformance fixtures.

## Deliverables

Reviewed symbol catalog, metadata and visual implementations, examples, and
compatibility tests.

## Public APIs

Existing `SymbolDefinition` and `SymbolRegistry` remain the baseline. TODO:
catalog/discovery additions require API review before export.

## Dependencies

Phase 01 symbols and geometry; Phase 02 SVG visual registry.

## Testing

Metadata validation, visual fallback, port conformance, state rendering, resizing,
and representative browser snapshots where stable.

## Definition of Done

Every accepted symbol has DOM-independent metadata, an SVG visual or documented
fallback, stable ports, and tested local-coordinate rendering.

## Exit Criteria

Catalog scope is approved, public changes are documented, and all quality gates
pass.

See also:

- [Symbol definition](../data-model/symbol-definition.md)
- [Symbol rendering](../data-model/symbol-rendering.md)
- [ADR 0020](../adr/0020-use-metadata-driven-symbol-renderers.md)
- [Phase 3 audit](../audits/phase-3-audit.md)
