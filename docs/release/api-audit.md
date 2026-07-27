# Interaction Engine API audit

## Public API

Result: PASS for the private release candidate.

The manifest exposes only `"."`; deep package paths are not public. Root exports
are grouped by responsibility: foundation, events, sessions, pointer, coordinates,
hit testing, selection, drag, keyboard, focus, accessibility, scheduling,
performance, diagnostics, policies, errors, and adapter contracts.

Ownership evidence:

| API group                        | Owner                  | Boundary                                                    |
| -------------------------------- | ---------------------- | ----------------------------------------------------------- |
| Interaction state and events     | Interaction Engine     | Renderer- and browser-independent                           |
| Selection, drag, keyboard, focus | Interaction Engine     | Operates on target IDs and immutable records                |
| Designer bridges                 | Designer Engine        | Converts targets into Designer selection and commands       |
| SVG accessibility adapters       | Renderer SVG           | Owns DOM, ARIA, and live-region projection                  |
| Coordinate primitives            | Geometry / Interaction | Geometry owns math; Interaction owns named-space conversion |

All public declarations compile under strict TypeScript settings including exact
optional properties and unchecked indexed access. No export was removed during
certification.

## Internal API

Result: PASS with one release-management issue.

The audit found no deprecated contract, legacy compatibility shim, unsafe type
escape, or duplicated DOM contract. Type-only modules intentionally compile away.
Benchmark helpers and diagnostic controllers are exported from the private package
for tooling consumers; they are not accidental deep exports.

The package remains private and version `0.0.0`. Public compatibility is therefore
not a semantic-version guarantee. Freeze an export manifest and assign a release
version before external publication.
