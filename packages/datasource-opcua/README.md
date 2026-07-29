# OPC UA datasource

Node.js-only OPC UA adapter for the Web SCADA datasource contracts. It uses `node-opcua` behind
the package boundary; runtime, binding, renderer, and persisted document packages receive only
protocol-neutral datasource events.

## Runtime and security

- Supported: Node.js 18.18+ and compatible Electron main processes.
- Not supported: direct browser TCP. Browser applications must compose this package in a trusted
  Node/gateway process.
- `MessageSecurityMode.None` is intended for local development. `Sign` and `SignAndEncrypt` map to
  the configured `node-opcua` security policy and are never downgraded by the adapter.
- Unknown-certificate auto-accept is off by default. Production deployments should provision a
  client application certificate and manage the node-opcua PKI trusted/rejected stores.
- Passwords and user private keys are resolved only during connection through `secretProvider`.
  Persist logical `secretRef` values, never resolved material.

```ts
import { createOpcUaDataSourceAdapter, opcUaDataPointAddress } from "@web-scada/datasource-opcua";

const adapter = createOpcUaDataSourceAdapter({
  identity: { id: "line-1", type: "opcua", displayName: "Line 1 PLC" },
  endpointUrl: "opc.tcp://plc.internal:4840",
  security: { mode: "SignAndEncrypt", policy: "Basic256Sha256" },
  userIdentity: { type: "username", secretRef: "vault://scada/line-1" },
  secretProvider: async (reference) => credentialVault.resolve(reference),
  points: [{ id: "speed", address: "nsu=urn%3Aplant;s=Motor.Speed", writable: true }],
  writes: { enabled: true }
});

await adapter.connect();
const speed = opcUaDataPointAddress("line-1", "speed", "nsu=urn%3Aplant;s=Motor.Speed");
const result = await adapter.read({ addresses: [speed] });
```

Addresses accept canonical NodeIds (`ns=2;s=Motor.Speed`), namespace-URI ExpandedNodeIds
(`nsu=urn%3Aplant;s=Motor.Speed`), and absolute browse paths. Namespace URIs and browse paths are
resolved against each live session so namespace-index changes do not enter persisted documents.

Writes and method calls require separate explicit flags. They are never retried by the adapter
after an ambiguous service outcome. Batches are bounded with `limits.maxNodesPerRead` and
`limits.maxNodesPerWrite`. Subscriptions share monitored items in one server subscription per
logical request, with bounded queues.

## Testing

`./testing` exports an in-process server fixture. The integration suite exercises the real selected
client library over loopback TCP:

```sh
pnpm vitest run packages/datasource-opcua/src
```

The dependency is pinned to `node-opcua 2.158.0` (MIT) because newer 2.175.x dependency resolution
currently mixes CommonJS `node-opcua-debug` with ESM-only `hexy` under this Node/Vitest setup.
Re-evaluate the pin after that upstream packaging incompatibility is resolved.
