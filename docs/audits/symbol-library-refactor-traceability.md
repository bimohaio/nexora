# Symbol Library Refactor Traceability

Status values in this checklist are updated as implementation evidence lands.

| Requirement area                            | Planned evidence                                                          | Status   |
| ------------------------------------------- | ------------------------------------------------------------------------- | -------- |
| Generic definitions remain renderer-neutral | Symbol contract and dependency tests                                      | Complete |
| Stable categories and ordering              | Category registry and category tests                                      | Complete |
| Stable IDs, aliases, and migrations         | Compatibility map and migration tests                                     | Complete |
| Complete Section 17 catalog                 | Generated catalog manifest and count tests                                | Complete |
| Definition validation                       | Unit tests for IDs, dimensions, variants, ports, states, and capabilities | Complete |
| Original vector visuals                     | SVG family packs and family renderer tests                                | Complete |
| No central per-type dispatch                | Family registration architecture and audit                                | Complete |
| Designer discovery and creation             | Registry palette plus existing Designer regression tests                  | Complete |
| Property and variant metadata               | Inspector-compatible metadata and tests                                   | Complete |
| Runtime/binding/state integration           | Runtime renderer integration tests                                        | Complete |
| Shared animation lifecycle                  | Existing scheduler suite; no per-symbol clocks added                      | Complete |
| Alarm compatibility                         | Existing alarm suite and family state-style tests                         | Complete |
| Serialization and legacy compatibility      | Alias canonicalization and preservation tests                             | Complete |
| Ports and anchors                           | Normalized validation and existing geometry tests                         | Complete |
| Gallery                                     | Search, category, theme, state, variant, rotation, and resize             | Complete |
| Accessibility                               | Existing renderer/Designer suites and gallery names                       | Complete |
| Security                                    | JSON-safe definitions; no SVG import or `innerHTML` path added            | Complete |
| Performance and disposal                    | Render/dispose all catalog visuals and existing performance suites        | Complete |
| Documentation and generated catalog         | Architecture guide, contributor checklist, catalog                        | Complete |
| Full regression matrix                      | Final audit with inherited lint/format debt documented                    | Complete |

## Implementation batches

1. Contracts, validation, category registry, compatibility map, and migrations.
2. Complete metadata catalog organized by semantic families.
3. SVG visual-family helpers and renderer packs.
4. Designer palette/inspector and gallery integration.
5. Runtime, binding, alarm, animation, serialization, and port verification.
6. Catalog, integration, accessibility, security, performance, and leak tests.
7. Documentation generation and final requirement-by-requirement audit.
