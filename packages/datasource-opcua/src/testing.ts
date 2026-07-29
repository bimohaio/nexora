import net from "node:net";
import { DataType, OPCUAServer, StatusCodes, Variant, type UAVariable } from "node-opcua";

export interface OpcUaTestServer {
  readonly endpointUrl: string;
  readonly temperatureNodeId: string;
  setTemperature(value: number): void;
  shutdown(): Promise<void>;
}

/** Starts a real, local node-opcua server. Intended for deterministic integration tests only. */
export async function startOpcUaTestServer(): Promise<OpcUaTestServer> {
  const port = await availablePort();
  const server = new OPCUAServer({
    port,
    alternateHostname: ["127.0.0.1"],
    resourcePath: "/UA/WebScadaTest",
    buildInfo: {
      productName: "WebScadaTestServer",
      buildNumber: "1",
      buildDate: new Date("2026-01-01T00:00:00.000Z")
    }
  });
  await server.initialize();
  const addressSpace = server.engine.addressSpace;
  if (!addressSpace) throw new Error("OPC UA test address space was not initialized.");
  const namespace = addressSpace.registerNamespace("urn:web-scada:test");
  const device = namespace.addObject({
    organizedBy: addressSpace.rootFolder.objects,
    browseName: "TestDevice"
  });
  let temperature = 20;
  const variable: UAVariable = namespace.addVariable({
    componentOf: device,
    browseName: "Temperature",
    nodeId: "s=Temperature",
    dataType: "Double",
    minimumSamplingInterval: 20,
    value: {
      get: () => new Variant({ dataType: DataType.Double, value: temperature }),
      set: (variant: Variant) => {
        if (variant.dataType !== DataType.Double && variant.dataType !== DataType.Int32)
          return StatusCodes.BadTypeMismatch;
        temperature = Number(variant.value);
        return StatusCodes.Good;
      }
    }
  });
  variable.setValueFromSource({ dataType: DataType.Double, value: temperature });
  await server.start();
  // Use the explicitly advertised loopback endpoint. Depending on host DNS/mDNS made the
  // integration suite intermittent even after the server had successfully bound to loopback.
  const endpointUrl = `opc.tcp://127.0.0.1:${port}/UA/WebScadaTest`;
  let stopped = false;
  return Object.freeze({
    endpointUrl,
    temperatureNodeId: variable.nodeId.toString(),
    setTemperature(value: number) {
      temperature = value;
      variable.setValueFromSource({ dataType: DataType.Double, value });
    },
    async shutdown() {
      if (stopped) return;
      stopped = true;
      await server.shutdown(0);
    }
  });
}

function availablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Unable to allocate test server port."));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}
