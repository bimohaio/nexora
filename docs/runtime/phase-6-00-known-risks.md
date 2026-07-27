# Phase 6.00 known risks

| ID     | Severity | Risk                                                          | Mitigation                                                                   | Target   |
| ------ | -------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------- |
| RT-001 | Medium   | Direct resolver is not a full expression engine.              | Keep raw/resolved boundary and injectable evaluator.                         | Phase 8  |
| RT-002 | Medium   | Provider status reporting is optional.                        | Production adapters must implement `subscribeStatus`.                        | Phase 9  |
| RT-003 | Low      | Revision eventually approaches numeric safe-integer limit.    | Add guarded rollover/session policy during hardening.                        | Phase 15 |
| RT-004 | Low      | Visual resolver scans bindings for an affected entity.        | Add entity binding index if Phase 14 profiling justifies it.                 | Phase 14 |
| RT-005 | Low      | Diagnostic buffer aggregates by limit, not repeated code/key. | Add deduplication if production telemetry shows spam.                        | Phase 15 |
| RT-006 | Low      | Legacy provider input uses ISO timestamps.                    | Normalize immediately; future providers may ingest canonical input directly. | Phase 9  |

None is an architectural blocker for Phase 6.01.
