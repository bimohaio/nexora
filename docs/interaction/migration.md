# Interaction migration

Phase 7 preserves existing Designer and renderer contracts. Consumers should import
engine types from `@web-scada/interaction-engine` and application adapters from
`@web-scada/designer-engine`.

Migration rules:

1. Normalize browser input into interaction input records at the host boundary.
2. Replace direct selection mutation with `SelectionManager` and the Designer
   selection bridge.
3. Replace direct transform mutation with `DragEngine` commands.
4. Project keyboard and accessibility state through renderer adapters.
5. Dispose subscriptions, active sessions, adapters, and renderers when unmounting.

No compatibility shim is required for the Phase 6 runtime API. Runtime visual state,
Designer document state, and interaction state remain separate.
