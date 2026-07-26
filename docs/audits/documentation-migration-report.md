# Documentation architecture migration report

Migration date: 2026-07-26.

## Outcome

The documentation now separates normative master specifications, detailed
architecture, data models, conventions, ADRs, phase specifications, audits, API
references, and delivery planning. Existing document content was preserved and
cross-linked; implementation files were not changed.

## Moved files

The following files moved without renumbering or substantive rewriting:

- `docs/decisions/0001-use-typescript.md` through
  `docs/decisions/0020-use-metadata-driven-symbol-renderers.md` moved to
  `docs/adr/` with identical filenames.
- `docs/roadmap/phase-1-audit.md` moved to `docs/audits/phase-1-audit.md`.
- `docs/roadmap/phase-2-audit.md` moved to `docs/audits/phase-2-audit.md`.
- `docs/roadmap/phase-2-hardening-audit.md` moved to
  `docs/audits/phase-2-hardening-audit.md`.

Completion checklists and `milestones.md` remain under `docs/roadmap/`.

## Newly created files

- Root and folder navigation: `docs/README.md` and `README.md` in every
  documentation subfolder.
- Master specification: `vision.md`, `architecture.md`,
  `package-boundaries.md`, `dependency-rules.md`, `public-api-policy.md`,
  `performance.md`, `security.md`, `testing-strategy.md`, `roadmap.md`, and
  `glossary.md`.
- Phase specifications: `phase-00-foundation.md` through
  `phase-15-production.md`.
- API references: `core-api.md`, `renderer-api.md`, `designer-api.md`,
  `runtime-api.md`, `binding-api.md`, and `plugin-api.md`.
- Delivery planning: `docs/roadmap/roadmap.md` and `release-plan.md`.
- This migration report.

## Broken-link report

Relative Markdown links were checked after migration. Result: no broken local
documentation links. External URLs, generated anchors, and links inside code
fences were outside this repository-path check.

## Duplicate-documentation report

No byte-identical Markdown documents remain. Conceptual overlap was reviewed:

- `master-spec/dependency-rules.md` is the normative summary;
  `conventions/dependency-rules.md` contains implementation-level detail.
- `master-spec/roadmap.md` defines authoritative phase intent;
  `roadmap/roadmap.md`, `milestones.md`, and `release-plan.md` track delivery.
- `data-model/render-change-set.md` documents the Core contract;
  `render-invalidation.md` documents Renderer-derived behavior.
- Symbol definition and symbol rendering pages describe generic metadata and
  SVG-specific visuals respectively.
- Audit reports intentionally preserve historical snapshots and may repeat
  evidence from current architecture documents.

No existing document was deleted as a duplicate.

## Terminology

New and updated navigation uses SCADA Core, Renderer, Designer Engine, Runtime
Engine, Binding Engine, and Plugin SDK consistently. Future Binding Engine and
Plugin SDK APIs are explicitly marked TODO.

See also:

- [Documentation index](../README.md)
- [Master specification](../master-spec/README.md)
- [Audit index](README.md)
