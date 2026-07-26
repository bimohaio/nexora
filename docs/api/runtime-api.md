# Runtime Engine API

Status: minimal contracts in `@web-scada/runtime-engine`.

Current exports are `RuntimeDataType`, `DataQuality`, `RuntimeValue`, `TagStore`,
`DataProvider`, `BindingEvaluationRequest`, and `BindingEvaluator`. They define
ephemeral values and provider/evaluation boundaries, not protocol
implementations.

TODO: runtime orchestration, lifecycle, alarms, scheduling, and production provider
behavior require later phase specifications and ADRs.

See also:

- [Phase 06 Runtime](../phases/phase-06-runtime.md)
- [State separation](../architecture/state-separation.md)
- [Runtime settings](../data-model/runtime-settings.md)
