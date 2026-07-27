# Selection policies

Policies are synchronous, composable predicates evaluated before a transition.
All policies must allow a target.

Built-in policies reject metadata marked locked, hidden, invisible, disabled,
layer-locked, or layer-invisible, and reject all targets when the manager is
read-only. `FilterSelectionPolicy` adapts application callbacks for nodes,
connections, layers, and custom targets.

The designer integration supplies `DesignerDocumentSelectionPolicy`, which checks
that node and connection IDs exist and excludes invisible or locked nodes and
layers. Policies do not alter documents or renderer state.
