# Phase 09 — Data source

## Goal

Add secure, replaceable data-source adapters behind Runtime Engine contracts.

## Scope

Provider lifecycle, subscriptions, reconnect/backoff, quality mapping,
configuration, credentials boundaries, and initial protocol adapters selected by
separate decisions.

## Deliverables

Provider SDK contracts, at least one reviewed adapter, diagnostics, configuration
model, and integration harness.

## Public APIs

Current `DataProvider` is minimal. TODO: configuration, capability, diagnostics,
and provider-factory APIs require Phase 9 ADRs.

## Dependencies

Phase 06 Runtime Engine, Phase 08 Binding Engine, security policy, and deployment
configuration.

## Testing

Protocol-independent contract tests, simulated disconnect/reconnect,
subscription cleanup, malformed data, quality conversion, and secret redaction.

## Definition of Done

Providers can be replaced without changing SCADA Core, Renderer, or Binding Engine
contracts.

## Exit Criteria

Threat review, lifecycle tests, adapter conformance, and operational documentation
pass.

See also:

- [Runtime Engine API](../api/runtime-api.md)
- [Security policy](../master-spec/security.md)
- [Package boundaries](../master-spec/package-boundaries.md)
