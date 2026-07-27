# Phase 6.01 known risks

| ID     | Severity | Classification       | Risk                                                           | Mitigation / target                                        |
| ------ | -------- | -------------------- | -------------------------------------------------------------- | ---------------------------------------------------------- |
| RT-101 | Medium   | FUTURE_MIGRATION     | Provider samples commit individually before visual coalescing. | Canonical simulator batches per tick; unify in Phase 6.02. |
| RT-102 | Medium   | HARDENING_REQUIRED   | App demo provider still uses wall-clock interval scheduling.   | Package simulator is deterministic and tested.             |
| RT-103 | Low      | COMPATIBLE_VARIATION | Atomic batches reject duplicate keys rather than last-write.   | Existing Phase 6.00 policy is explicit and tested.         |
| RT-104 | Low      | FUTURE_MIGRATION     | Direct resolver is not the Phase 8 expression engine.          | Preserve raw/resolved boundary.                            |

None is an architectural blocker. Runtime state remains ephemeral,
instance-scoped, renderer-neutral, and separate from the design document.
