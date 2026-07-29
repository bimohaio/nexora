import { afterEach, describe, expect, it } from "vitest";
import type { DataSourceEvent } from "@web-scada/datasource-core";
import { createOpcUaDataSourceAdapter } from "./adapter.js";
import { opcUaDataPointAddress } from "./addressing.js";
import { startOpcUaTestServer, type OpcUaTestServer } from "./testing.js";

describe("OPC UA adapter with an actual local server", () => {
  let server: OpcUaTestServer | undefined;
  const adapters: ReturnType<typeof createOpcUaDataSourceAdapter>[] = [];
  afterEach(async () => {
    await Promise.all(adapters.splice(0).map((adapter) => adapter.dispose()));
    await server?.shutdown();
    server = undefined;
  });

  it("connects, batches reads and writes, browses, and disposes cleanly", async () => {
    server = await startOpcUaTestServer();
    const adapter = create(server.endpointUrl, server.temperatureNodeId, true);
    adapters.push(adapter);
    await adapter.connect();
    expect(adapter.getStatus().state).toBe("connected");

    const address = opcUaDataPointAddress("opc", "temperature", server.temperatureNodeId);
    const aliasAddress = opcUaDataPointAddress(
      "opc",
      "temperature-alias",
      server.temperatureNodeId
    );
    const read = await adapter.read({ addresses: [address, aliasAddress] });
    expect(read.failures).toEqual([]);
    expect(read.values.map((item) => item.value)).toEqual([20, 20]);

    const write = await adapter.write({ items: [{ address, value: 31.5 }] });
    expect(write.results).toEqual([{ ok: true, address }]);
    expect((await adapter.read({ addresses: [address] })).values[0]?.value).toBe(31.5);

    const browse = await adapter.browse({});
    expect(browse.points).toEqual([
      expect.objectContaining({ address, dataType: "Double", readable: true, writable: true })
    ]);
    expect(adapter.getDiagnostics()).toMatchObject({
      sessionActive: true,
      completedReads: 3,
      completedWrites: 1
    });
    await adapter.dispose();
    await adapter.dispose();
    expect(adapter.getStatus().state).toBe("disposed");
  }, 20_000);

  it("receives monitored values and stops after unsubscribe", async () => {
    server = await startOpcUaTestServer();
    const adapter = create(server.endpointUrl, server.temperatureNodeId, false);
    adapters.push(adapter);
    await adapter.connect();
    const address = opcUaDataPointAddress("opc", "temperature", server.temperatureNodeId);
    const events: DataSourceEvent[] = [];
    const handle = await adapter.subscribe(
      { addresses: [address], samplingIntervalMs: 25, publishIntervalMs: 50, queueSize: 2 },
      (event) => events.push(event)
    );
    server.setTemperature(77);
    await eventually(() =>
      events.some((event) => event.type === "VALUE" && event.value.value === 77)
    );
    await handle.unsubscribe();
    const count = events.length;
    server.setTemperature(88);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(events).toHaveLength(count);
    expect(handle.closed).toBe(true);
  }, 20_000);

  it("enforces write and method permissions and redacts endpoint credentials", async () => {
    server = await startOpcUaTestServer();
    const adapter = create(server.endpointUrl, server.temperatureNodeId, false);
    adapters.push(adapter);
    await adapter.connect();
    const address = opcUaDataPointAddress("opc", "temperature", server.temperatureNodeId);
    await expect(adapter.write({ items: [{ address, value: 1 }] })).rejects.toMatchObject({
      code: "DATASOURCE_ACCESS_DENIED"
    });
    await expect(
      adapter.callMethod({ objectId: "ns=0;i=85", methodId: "ns=0;i=1" })
    ).rejects.toMatchObject({ code: "DATASOURCE_ACCESS_DENIED" });
    expect(JSON.stringify(adapter.getDiagnostics())).not.toContain("password");
  }, 20_000);
});

function create(
  endpointUrl: string,
  address: string,
  writes: boolean
): ReturnType<typeof createOpcUaDataSourceAdapter> {
  return createOpcUaDataSourceAdapter({
    identity: { id: "opc", type: "opcua", displayName: "Integration OPC UA" },
    endpointUrl,
    security: { mode: "None", policy: "None" },
    points: [{ id: "temperature", address, dataType: "Double", writable: true }],
    writes: { enabled: writes }
  });
}
async function eventually(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for OPC UA event.");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
