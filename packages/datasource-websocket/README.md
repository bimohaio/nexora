# WebSocket data source

`@web-scada/datasource-websocket` implements a persistent, framework-independent WebSocket data
source. One socket is authoritative per shared lifecycle generation. Late events are ignored,
unexpected closes enter the shared reconnect policy, and active logical subscriptions restore
after reconnection.

```ts
const adapter = createWebSocketDataSourceAdapter({
  identity: { id: "ws-main", type: "websocket" },
  endpoint: { url: "wss://example.invalid/live" },
  mapping: {
    batchPath: ["values"],
    keyPath: ["key"],
    valuePath: ["value"],
    qualityPath: ["quality"],
    timestampPath: ["timestamp"],
    sequencePath: ["sequence"]
  },
  commands: { subscribeType: "subscribe", unsubscribeType: "unsubscribe" }
});
```

Without command configuration, subscriptions filter a broadcast stream locally. With command
types, validated JSON subscribe/unsubscribe messages are sent and logical subscription ownership
still remains in the shared manager. Server acknowledgements and protocol handshakes are not part
of the initial API.

Text JSON is decoded sequentially, preserving socket and batch order. Malformed or binary
messages are isolated. Messages default to 1 MiB, batches to 1,000 items, and the inbound queue to
100 messages. Queue exhaustion closes the authoritative generation so reconnect can recover.
Optional application-level heartbeat messages use the shared scheduler and never rely on browser
ping frames.

WSS is required unless WS is explicitly enabled. Embedded credentials are rejected, diagnostics
omit query strings, host allowlists are supported, and short-lived subprotocol authentication is
resolved immediately before connecting. Browser WebSocket is the default; Node applications
inject a compatible `WebSocketTransportFactory`.

Read and write report unsupported unless a future explicit correlated protocol mapping is added.
Normalized events integrate through `createDataSourceRuntimeBridge`; runtime, bindings, and
renderer remain protocol-independent.
