# `@web-scada/datasource-mqtt`

Production-oriented MQTT data-source adapter built on the shared data-source lifecycle and
subscription manager.

## Boundaries

- MQTT 3.1.1 is configured as protocol version `4`; MQTT 5 as `5`.
- A repository-owned `MqttTransport` is injected. Native clients, sockets, certificates, and
  resolved credentials never appear in persisted configuration or normalized events.
- The transport performs one connection attempt. Native automatic reconnect must be disabled;
  the shared lifecycle controller is the only reconnect owner.
- Node transports may resolve TCP/TLS and certificate references. Browser transports normally
  use `ws`/`wss` and browser-managed TLS; custom client certificates are not claimed in browsers.
- `mqtts` and `wss` are accepted by default. `mqtt` and `ws` require `allowInsecure: true`.
  Deployments should also configure `allowedHosts`; Node transports must treat broker URLs as
  SSRF-sensitive input.

## Behavior

Logical subscriptions use shared reference counting and are restored after reconnect. Active
intent is resubscribed even when CONNACK says a persistent session is present, because local
intent remains authoritative. Wildcards, `$SYS` rules, and `$share/{group}/{filter}` matching are
implemented without regex conversion.

Payload decoders support JSON, UTF-8 text, strict numeric text, configured boolean tokens, and
explicit base64 conversion. Binary-to-runtime conversion never happens implicitly. Message size,
batch size, queue size, and inflight publish counts are bounded. Queue overflow drops the newest
message with a diagnostic.

Writes require both a configured address-to-topic mapping and explicit publish permission.
Disconnected writes are rejected; there is no hidden offline command queue. Retained commands
require `allowRetain` and publish permission. QoS acknowledgements mean MQTT protocol progress,
not device execution. MQTT QoS is never mapped to point quality.

The adapter intentionally reports `read: false`: no local duplicate cache or implicit
request-response protocol is created. Applications needing request-response should add an
explicit bounded strategy in a later phase.

## Safe example

```ts
const adapter = createMqttDataSourceAdapter({
  identity: { id: "mqtt-main", type: "mqtt" },
  connection: {
    url: "wss://broker.example.invalid/mqtt",
    protocolVersion: 5,
    clientId: "scada-runtime-01",
    cleanStart: false,
    sessionExpiryIntervalSeconds: 3600
  },
  subscriptions: [
    {
      topicFilter: "factory/+/temperature",
      qos: 1,
      mapping: {
        address: { sourceId: "mqtt-main", key: "temperature" },
        decoder: { type: "json" },
        valuePath: ["value"]
      }
    }
  ],
  permissions: { subscribe: true, publish: false },
  transportFactory
});
```

Credential references are resolved immediately before every connect. Diagnostics redact topics
and URL query parameters by default and never include payloads or secrets.
