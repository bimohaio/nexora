# `@web-scada/datasource-modbus`

Production-oriented Modbus datasource integration for the shared Web SCADA datasource contracts.

## Features

- Modbus TCP through the Node-only `./node` transport; custom transports support RTU, gateways, and application bridges.
- Coils, discrete inputs, input registers, and holding registers.
- Typed zero-based addressing plus explicit parsing of `area:offset`, `unit=N;area:offset`, and 0xxxx/1xxxx/3xxxx/4xxxx references.
- Deterministic 16/32/64-bit, float, bit-field, string, and raw-register codecs with explicit byte and word ordering.
- Grouped polling through the shared scheduler and subscription lifecycle; no timer per tag.
- Serialized priority queue (writes, direct reads, polls), deadband, quality transitions, reconnect restoration, diagnostics, controlled writes, and optional read-back verification.
- Hardware-free `MockModbusTransport`.

## Node TCP example

```ts
import { createModbusDataSourceAdapter } from "@web-scada/datasource-modbus";
import { createNodeModbusTcpTransportFactory } from "@web-scada/datasource-modbus/node";

const adapter = createModbusDataSourceAdapter({
  identity: { id: "boiler-plc", type: "modbus" },
  connection: { transport: "tcp", host: "10.0.0.20", port: 502, unitId: 1 },
  transportFactory: createNodeModbusTcpTransportFactory(),
  polling: { intervalMs: 1000, mergeGap: 2 },
  writes: { enabled: true, verification: "exact-match" },
  points: [
    {
      id: "temperature",
      address: { area: "holding-register", address: 0 },
      dataType: "float32",
      scale: 0.1
    },
    {
      id: "pump-command",
      address: { area: "coil", address: 4 },
      dataType: "boolean",
      writable: true
    }
  ]
});
await adapter.connect();
```

Datasource addresses use `{ sourceId: "boiler-plc", key: "temperature" }`; protocol details remain internal.

## Address and value policy

Canonical addresses are zero-based protocol offsets. `40001` explicitly maps to holding register offset 0; it is never guessed to mean protocol offset 40001. Register point spans are derived from their data type. Values outside the JSON-safe 64-bit range are emitted as decimal strings, never lossy numbers. Scaled writes apply `(engineeringValue - offset) / scale`, reject overflow, and default to rejecting fractional integer results.

Strings support ASCII and UTF-8 decoding with explicit byte length. Writes reject oversized strings rather than truncating. Register-bit writes are rejected because unsafe read-modify-write can race.

## Runtime and security

Direct TCP supports Node.js and Electron main processes. Browsers and Electron renderers require an application gateway or injected custom transport; the default entry does not import `node:net`. Secrets are not part of any configuration contract. `connectionRef` is a non-secret lookup key for application-owned transport factories, and endpoint credentials are never logged.

The TCP transport is implemented locally behind `ModbusTransport`, avoiding third-party protocol coupling. It validates MBAP transaction IDs and response lengths, applies request/connect timeouts, maps exception responses, and releases sockets on disconnect/dispose. The tradeoff is that RTU framing and TLS tunnels remain application-provided transports.

## Testing

```ts
import { createMockModbusTransportFactory } from "@web-scada/datasource-modbus/testing";
const { transport, factory } = createMockModbusTransportFactory();
transport.holdingRegisters.set(0, 42);
```

Unit tests cover address grouping, endian combinations, overflow, lifecycle reads/writes, access control, and cleanup without hardware or network access.
