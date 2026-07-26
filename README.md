# Web SCADA

A framework-independent TypeScript foundation for industrial graphics, HMI, P&ID, BMS, electrical, water-treatment, dashboard, and digital-twin applications.

## Phase 0 scope

Phase 0 establishes versioned document contracts, geometry utilities, validation and migration boundaries, metadata-driven symbols, renderer and engine interfaces, typed commands/events, strict tooling, and build-only demo applications. It does not implement a production designer or runtime.

## Technology

TypeScript, ES modules, pnpm workspaces, Vite, native HTML/CSS/SVG/DOM boundaries, Web Components boundaries, ESLint, Prettier, Vitest, and Playwright.

## Structure

```text
apps/       designer-demo and runtime-demo
packages/   core, geometry, renderer-svg, symbols, designer-engine,
            runtime-engine, web-components, and shared
docs/       architecture, data model, ADRs, conventions, and roadmap
examples/   future domain examples
tests/      future integration and performance suites
tooling/    shared TypeScript, ESLint, and build documentation
```

## Development

```bash
pnpm install
pnpm dev
pnpm dev:runtime
pnpm build
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
```

`pnpm dev` starts the designer foundation demo. `pnpm dev:runtime` starts the runtime foundation demo.

## Packages

- `core`: environment-neutral document, port, validation, migration, command, and event contracts.
- `geometry`: DOM-independent geometry contracts and pure utilities.
- `symbols`: metadata and a small in-memory symbol registry.
- `renderer-svg`: readonly renderer and change-set contracts.
- `designer-engine`: public editing-engine boundaries.
- `runtime-engine`: ephemeral tag values, quality, providers, and evaluation boundaries.
- `web-components`: future UI adapter boundaries and theme tokens.
- `shared`: intentionally empty until a genuinely shared low-level utility appears.

Dependencies point inward: UI → engines → renderer → core/geometry/symbols. ESLint restrictions enforce prohibited package imports.

## Current limitations

There is no editing interaction, full SVG renderer, routing, history manager, symbol library, real data provider, protocol integration, alarm processing, persistence service, authentication, collaboration, or production UI.

## Roadmap

Phase 1 should introduce a minimal readonly SVG document renderer, a document factory/parser with comprehensive structural validation, a single example symbol renderer, and browser-level renderer tests without expanding into designer interactions.
