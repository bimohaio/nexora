# Phase 10 Authoring Guide

Select one symbol in Designer to open Data Bindings and Animation and Alarm panels.

- Data Bindings creates validated tag, expression or constant bindings through
  `BindingAuthoringService`.
- Animation preset selects none, rotate, pulse, blink or flow preview intent.
- Alarm preview selects normal, warning or critical semantic state.
- Reduced Motion previews a static semantic fallback.
- Visibility Optimization previews normal scheduler eligibility versus always-active behavior.

Phase 10 preview values are stored as ordinary `JsonValue` node properties. The authoring demo does
not evaluate runtime bindings, create timers, resolve alarm severity or mutate Runtime state. Runtime
remains responsible for resolution after publication. Validation and the revisioned Runtime handoff
use the existing serialized `ScadaDocument` API.

Reset runtime state from the Runtime demo after publication when testing a scenario from its initial
conditions. The Designer undo/redo history includes authoring property edits.
