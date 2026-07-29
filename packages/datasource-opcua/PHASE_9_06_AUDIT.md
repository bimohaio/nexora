# Phase 9.06 audit

| Requirement group                            | Status  | Automated evidence / remaining work                                                                                                                                          |
| -------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package boundary and Node-only runtime       | PASS    | Independent package; no runtime, binding, renderer, document, or UI dependency. Conditional package exports expose only Node implementation and testing fixture.             |
| Immutable configuration and early validation | PASS    | `validation.ts` covers endpoint scheme, security compatibility, identity/secret shape, timeouts, limits, and unique points.                                                  |
| Secret and diagnostics boundary              | PASS    | Only logical references are configurable; provider output is transient; diagnostics redact URL credentials/query and never include identity material.                        |
| Address parsing and namespace refresh        | PASS    | Unit tests cover NodeId identifiers, ExpandedNodeId, paths, malformed input; URI resolution reads each active session namespace array.                                       |
| Real client/server integration               | PASS    | In-process `OPCUAServer` tests use the actual `OPCUAClient` over loopback TCP for connect/read/write/browse/subscription/disposal.                                           |
| Normalized values, status, and timestamps    | PASS    | Semantic tests cover scalar, ByteString, 64-bit representation, good/bad quality, source/server/receive timestamps.                                                          |
| Batch reads/writes and partial results       | PASS    | Bounded batch implementation returns per-point failures/statuses; actual-server batch read/write is tested.                                                                  |
| Browse                                       | PARTIAL | One-level deterministic browse and configured-point discovery are implemented. Continuation-point and recursive traversal APIs remain to be added.                           |
| Subscriptions and monitored items            | PARTIAL | Actual-server notification, bounded queue, unsubscribe, and disposal are tested. Transfer/republish and deterministic recreation after server restart are not yet exercised. |
| Shared lifecycle/reconnect                   | PARTIAL | Shared lifecycle controller provides bounded reconnect and cancellation; server-restart, session invalidation, and transfer/recreate tests remain.                           |
| Endpoint discovery/selection                 | PARTIAL | `node-opcua` endpoint validation is enabled. Explicit normalized discovery ranking and endpoint-matrix tests remain.                                                         |
| Secure modes and server trust                | PARTIAL | None/Sign/SignAndEncrypt and modern policies are mapped without downgrade. Generated-certificate integration tests for trust/reject/expiry are not yet present.              |
| Anonymous/username/user-certificate identity | PARTIAL | All identity boundaries are implemented, including async secret lookup. Only anonymous is exercised by the local integration server.                                         |
| Metadata and operation limits                | PARTIAL | Configured metadata and client batch limits are exposed. Lazy attribute metadata and server-advertised limit discovery remain.                                               |
| Method calls                                 | PARTIAL | Explicitly permissioned, non-retried call and normalized outputs are implemented. A real-server method fixture is not yet present.                                           |
| Documentation and dependency record          | PASS    | README documents runtime, security, credential handling, examples, test command, MIT dependency, pin reason, and limitations.                                                |

Phase status is **PARTIAL** under the phase completion policy. No mandatory tests are skipped or
marked passing without evidence; the table identifies the remaining production-hardening suites.
