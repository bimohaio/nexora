# Animation Lifecycle

The normal path is `idle → scheduled → delayed → running → completed → disposed`.
Running instances may pause and resume. Active states may cancel or fail. Disposal
is allowed from every non-disposed state and is idempotent.

`AnimationOwnershipRegistry` indexes handles by instance and owner. Disposing a
renderer, document, session or entity owner disposes its children and removes
references. No callback is authorized after owner disposal.
