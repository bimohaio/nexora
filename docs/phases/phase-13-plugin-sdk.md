# Phase 13 — Plugin SDK

## Goal

Define stable, capability-scoped framework extension points.

## Scope

Plugin manifests, discovery, compatibility, lifecycle, capabilities, registration,
diagnostics, isolation, and extension points selected through ADRs.

## Deliverables

Plugin SDK package, manifest schema, host contracts, example plugins, validation,
and security guidance.

## Public APIs

TODO: no Plugin SDK API exists. Extension-data fields are persistence escape
hatches, not executable plugin contracts.

## Dependencies

Stable SCADA Core, symbol, Renderer, Designer Engine, Runtime Engine, and Binding
Engine APIs plus production security policy.

## Testing

Manifest validation, compatibility rejection, capability enforcement, lifecycle
cleanup, failure isolation, and example-plugin conformance.

## Definition of Done

Plugins extend only documented surfaces and cannot silently cross package or trust
boundaries.

## Exit Criteria

Threat model, compatibility policy, SDK tests, examples, and API review pass.

See also:

- [Plugin SDK API](../api/plugin-api.md)
- [Extensions model](../data-model/extensions.md)
- [Public API policy](../master-spec/public-api-policy.md)
