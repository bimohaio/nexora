# Phase 00 — Foundation

## Goal

Establish the strict TypeScript workspace, package boundaries, conventions, and
buildable application shells.

## Scope

Workspace tooling, package layout, baseline contracts, documentation conventions,
and build-only demos.

## Deliverables

Strict TypeScript configuration, package entry points, quality scripts, initial
ADRs, architecture documents, and demo shells.

## Public APIs

Foundational package exports and versioned contract locations. No end-user SCADA
behavior is introduced by this phase alone.

## Dependencies

Node.js, pnpm workspace tooling, TypeScript, linting, formatting, and testing
infrastructure.

## Testing

Formatting, lint, typecheck, build, and package-boundary verification.

## Definition of Done

Every workspace package builds independently and dependency directions are
documented.

## Exit Criteria

Completion checklist and Phase 0 quality gates pass.

See also:

- [Phase 0 checklist](../roadmap/phase-0-completion-checklist.md)
- [Package boundaries](../master-spec/package-boundaries.md)
- [ADR 0001](../adr/0001-use-typescript.md)
