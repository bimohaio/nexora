# Interaction state model

Interaction state records the current pointer, pressed buttons, modifiers, active
session ID, hover target, focused target, and pointer position. State objects are
replaced rather than mutated and have no global singleton.

`InteractionStateStore` provides `replace`, partial `update`, and subscriptions.
Each replacement receives a fresh button set and frozen outer state. Consumers
must treat nested normalized contracts as immutable. Disposing clears all
subscriptions.
