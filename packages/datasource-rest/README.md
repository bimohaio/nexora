# REST data source

`@web-scada/datasource-rest` implements a framework-independent, fetch-compatible data-source
adapter. `connect()` means configuration and authentication readiness; it does not model a
persistent HTTP connection.

Polling starts only for connected logical subscriptions. It uses the shared scheduler and
subscription manager, groups all requested mappings into one response, and schedules the next
poll with a fixed delay after completion. Requests never overlap within a polling group. The last
logical unsubscribe, disconnect, reconnect suspension, or disposal cancels its task and active
request.

```ts
const adapter = createRestDataSourceAdapter({
  identity: { id: "rest-main", type: "rest" },
  endpoint: { url: "https://example.invalid/api/values" },
  polling: { intervalMs: 1_000 },
  response: {
    timestampPath: ["timestamp"],
    points: [
      {
        address: { sourceId: "rest-main", key: "temperature" },
        path: ["data", "temperature"],
        qualityPath: ["data", "quality"],
        expectedType: "number"
      }
    ]
  }
});
```

Reads return partial failures for unknown or malformed points. Writes are disabled unless a
separate write endpoint is configured; successful HTTP completion confirms transport acceptance,
not an authoritative device-value change.

Only JSON and empty successful write responses are supported. HTTPS is required unless HTTP is
explicitly enabled. URLs reject embedded credentials and diagnostics omit queries. Static secret
headers are rejected: inject short-lived headers through `authProvider`. Responses default to
1 MiB, requests to 256 KiB, and declarative paths to 32 segments. Host allowlists are supported.
Node hosts should additionally enforce DNS/private-network policy in the injected transport to
protect against SSRF and DNS rebinding.

The default transport wraps Fetch and works in browsers and Node versions providing Fetch.
Inject `HttpTransport` for other hosts and deterministic tests. Use
`createDataSourceRuntimeBridge`; this package contains no protocol-specific runtime integration.

Known limits: conditional requests, `Retry-After` scheduling, confirmation reads, and persisted
body templates are not implemented.
