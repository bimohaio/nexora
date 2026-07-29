import { describe, expect, it } from "vitest";
import { createModbusDataSourceAdapter } from "./adapter.js";
import { createMockModbusTransportFactory } from "./testing.js";

describe("Modbus adapter", () => {
  it("reads and controls writes through normalized datasource contracts", async () => {
    const { transport, factory } = createMockModbusTransportFactory();
    transport.holdingRegisters.set(0, 123);
    const adapter = createModbusDataSourceAdapter({
      identity: { id: "plc-1", type: "modbus" },
      connection: { transport: "custom" },
      transportFactory: factory,
      writes: { enabled: true },
      points: [
        {
          id: "level",
          address: { area: "holding-register", address: 0 },
          dataType: "uint16",
          writable: true
        }
      ]
    });
    await adapter.connect();
    const address = { sourceId: "plc-1", key: "level" };
    expect((await adapter.read({ addresses: [address] })).values[0]?.value).toBe(123);
    expect((await adapter.write({ items: [{ address, value: 456 }] })).results[0]?.ok).toBe(true);
    expect(transport.holdingRegisters.get(0)).toBe(456);
    await adapter.dispose();
    expect(transport.disposed).toBe(true);
  });
  it("rejects writes to read-only areas before transport execution", async () => {
    const { transport, factory } = createMockModbusTransportFactory();
    const adapter = createModbusDataSourceAdapter({
      identity: { id: "plc-1", type: "modbus" },
      connection: { transport: "custom" },
      transportFactory: factory,
      writes: { enabled: true },
      points: [{ id: "input", address: { area: "input-register", address: 0 }, dataType: "uint16" }]
    });
    await adapter.connect();
    const before = transport.requestCount;
    await expect(
      adapter.write({
        items: [{ address: { sourceId: "plc-1", key: "input" }, value: 1 }]
      })
    ).rejects.toMatchObject({ code: "DATASOURCE_ACCESS_DENIED" });
    expect(transport.requestCount).toBe(before);
    await adapter.dispose();
  });
});
