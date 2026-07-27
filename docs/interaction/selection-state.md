# Selection state

Selection state contains:

- qualified selected IDs (`kind:id`) for constant-time membership checks;
- an ordered target list and matching stable order;
- primary and active targets;
- revision, mode, and source metadata.

The outer state and ordered arrays are frozen and replaced for every accepted
transition. Targets are metadata contracts and must be treated as immutable.
Revision increments only when selection, primary target, or active target changes.
Duplicate targets are removed while retaining their first occurrence.

Primary selection defaults to the first selected target, remains stable while it
is still selected, and can be explicitly changed only to an existing selection.
