# Phase 7 technical debt register

| ID          | Severity | Description                                                                       | Impact                                                       | Recommended phase                 | Priority | Effort | Owner            |
| ----------- | -------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------- | -------- | ------ | ---------------- |
| INT-008-001 | High     | Interaction coverage is 75.55% statements, 77.65% branches, and 73.17% functions. | Fails the explicit 90% release criterion.                    | Phase 7 certification remediation | P0       | Large  | Interaction team |
| INT-008-002 | High     | Firefox, WebKit/Safari, and Edge projects are not configured or executed.         | Cross-browser compatibility cannot be certified.             | Phase 7 certification remediation | P0       | Medium | QA               |
| INT-008-003 | Medium   | No retained-memory browser soak test exists.                                      | Long-duration leak freedom is not measured.                  | Phase 14                          | P1       | Medium | Performance      |
| INT-008-004 | Medium   | Browser FPS, cache-hit ratio, and scheduler-efficiency reports are not emitted.   | Microbenchmarks pass, but requested telemetry is incomplete. | Phase 14                          | P1       | Medium | Performance      |
| INT-008-005 | Low      | Interaction Engine remains private at version `0.0.0`.                            | External compatibility cannot be guaranteed semantically.    | Phase 15                          | P2       | Small  | Architecture     |

Each item is backed by repository configuration, executed coverage, or benchmark
output. No speculative feature recommendation is included.
