# Phase 10 Dependency Boundaries

Generic animation contracts have no package dependency. Alarm visualization uses
animation policy types and Runtime Engine quality terminology, but no DOM or data
source adapter. SVG Renderer and Designer may consume both generic packages.

Forbidden imports are checked by architecture tests:

- generic packages → SVG, application UI, Vue, React or protocol adapters;
- symbols → scheduler implementations;
- data-source adapters → animation/alarm visuals;
- renderer → data-source adapters.

The complete shared scheduler belongs to Phase 10.01.
