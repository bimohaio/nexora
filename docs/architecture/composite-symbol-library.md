# Composite Symbol Library

## Architecture

The standard library has two deliberately separate registries:

- `@web-scada/symbols` owns immutable renderer-neutral definitions, categories,
  search metadata, properties, variants, states, ports, anchors, aliases, and
  compatibility helpers.
- `@web-scada/renderer-svg` owns SVG DOM creation. It registers a visual for
  each canonical type through reusable semantic family renderers.

Designer, Runtime, Binding Engine, alarm visualization, and animation continue
to use their existing boundaries. Definitions contain no SVG elements, clocks,
subscriptions, tag readers, binding evaluators, or alarm evaluators.

## Catalog

The composite manifest contains all 378 entries listed by the refactor prompt.
They are organized into 17 stable categories:

| Category ID                   | Name                            | Count |
| ----------------------------- | ------------------------------- | ----: |
| `indicators-alarms`           | Indicators and Alarms           |    15 |
| `hmi-controls`                | Buttons and HMI Controls        |    20 |
| `valves`                      | Valves                          |    35 |
| `pumps`                       | Pumps                           |    18 |
| `motors-drives`               | Motors and Drives               |    18 |
| `pipes-connectors`            | Pipes and Connectors            |    25 |
| `tanks-vessels`               | Tanks and Vessels               |    22 |
| `conveyors-material-handling` | Conveyors and Material Handling |    15 |
| `process-equipment`           | Process Equipment               |    35 |
| `instruments-sensors`         | Instruments and Sensors         |    40 |
| `electrical`                  | Electrical                      |    30 |
| `hvac`                        | HVAC                            |    15 |
| `displays-visualization`      | Displays and Visualization      |    20 |
| `navigation-layout`           | Navigation and Layout           |    20 |
| `utilities-authoring`         | Utilities and Authoring Helpers |    20 |
| `robotics-automation`         | Robotics and Factory Automation |    15 |
| `oil-gas`                     | Oil and Gas                     |    15 |

The authoritative complete type/name/category list is the exported
`COMPOSITE_CATALOG` manifest in
`packages/symbols/src/composite-catalog.ts`. Tests require exactly 378 unique
canonical entries and a registered SVG visual for every one. Together with the
8 original foundation symbols and 42 preserved industrial symbols, the
standard registry exposes 428 canonical definitions.

## Contracts

Definitions declare:

- deterministic type and category IDs;
- default and minimum dimensions plus aspect policy;
- stable property keys and validated defaults;
- bindable properties;
- normalized states and runtime capabilities;
- variants and variant property overlays;
- normalized semantic ports and anchors;
- explicit Designer/Runtime capabilities;
- search tags, aliases, deprecation data, and renderer-neutral family metadata.

Registered definitions and their metadata arrays are frozen. Ports use
normalized coordinates so the existing transform and connection geometry
pipeline continues to handle resize, rotation, and flip.

## IDs, aliases, and migration

IDs use lowercase dot-separated namespaces and kebab-case names. Labels and
localization never determine identity. Published type, property, and port IDs
must not be changed.

All former definitions remain registered. Existing aliases continue to resolve
through `SymbolRegistry.resolveType`. `canonicalizeDocumentSymbolTypes`
immutably replaces resolvable aliases while preserving node identity,
transforms, properties, bindings, extensions, connection references, and
ordering. It is deterministic and idempotent. Unknown types remain unchanged
and use the renderer's safe fallback.

## Visual families

The SVG package implements 17 original vector families: indicator, control,
valve, pump, motor, pipe, vessel, conveyor, process equipment, instrument,
electrical, HVAC, display, layout, authoring, automation, and oil/gas.
Definitions select a family and semantic visual kind through JSON-safe
metadata. A family drawer is shared, while kind-specific vector details keep
symbols recognizable. There is no per-type renderer switch and no raster or
external asset dependency.

Operational colors use the existing resolved symbol state. Symbols do not
create animation loops. Motion-capable definitions remain compatible with the
shared scheduler and alarm overlay pipeline.

## Designer and gallery

The Designer palette uses registry search, category metadata, and definition
defaults. It exposes every canonical entry, case-insensitive search, category
filtering, and variant editing. Inserted nodes receive the declared default
size and serializable default properties.

The gallery uses the production renderer path. It supports search, category,
state, variant, size, rotation, and theme controls. Previews are activated with
`IntersectionObserver`, keeping the 428-entry catalog responsive and disposing
renderer resources on teardown.

## Adding a symbol

1. Add a deterministic entry to the appropriate catalog family.
2. Declare any family-specific properties, meaningful states, variants, ports,
   and capabilities; do not infer them from the category.
3. Add a family vector detail if the existing geometry is not recognizable.
4. Add aliases rather than deleting or renaming a published ID.
5. Run definition, visual registry, render-all, migration, and integration
   tests.
6. Verify palette creation, property editing, Runtime state/binding updates,
   serialization, and gallery preview.

Never place SVG/DOM code in the generic package, protocol readers or binding
logic in a symbol, untrusted text through `innerHTML`, executable SVG content,
or a timer/animation loop in an individual renderer. Imported custom SVG must
be sanitized by the repository security boundary; standard symbols do not
load external SVG.

## Performance guidance

Keep static renderers free of scheduler registration, avoid globally addressed
SVG resources, update compatible DOM nodes through the existing synchronizer,
lazy-mount large preview collections, and always dispose renderers,
subscriptions, and shared scheduler handles.
