import { describe, expect, it } from "vitest";
import type { HttpTransport, HttpTransportRequest } from "./contracts.js";
import { createRestDataSourceAdapter, safeEndpoint } from "./index.js";

const temperature = { sourceId: "rest-main", key: "temperature" };
const pressure = { sourceId: "rest-main", key: "pressure" };

class FakeHttp implements HttpTransport {
  public requests: HttpTransportRequest[] = [];
  public response = {
    status: 200,
    body: JSON.stringify({
      data: { temperature: 21.5, pressure: 4 },
      timestamp: 1_700_000_000_000
    })
  };
  public async execute(request: HttpTransportRequest): Promise<typeof this.response> {
    await Promise.resolve();
    this.requests.push(request);
    return this.response;
  }
}

describe("REST adapter", () => {
  it("validates endpoints, performs grouped reads, isolates missing points, and writes explicitly", async () => {
    const transport = new FakeHttp();
    const adapter = createRestDataSourceAdapter({
      identity: { id: "rest-main", type: "rest" },
      endpoint: { url: "https://example.invalid/api/values?secret=no-log" },
      response: {
        timestampPath: ["timestamp"],
        points: [
          { address: temperature, path: ["data", "temperature"], expectedType: "number" },
          { address: pressure, path: ["data", "pressure"], expectedType: "number" }
        ]
      },
      write: {
        endpoint: { url: "https://example.invalid/api/write", method: "POST" }
      },
      transport
    });
    await adapter.connect();
    const read = await adapter.read({
      addresses: [temperature, pressure, { sourceId: "rest-main", key: "unknown" }]
    });
    expect(read.values.map(({ value }) => value)).toEqual([21.5, 4]);
    expect(read.failures).toHaveLength(1);
    expect(transport.requests).toHaveLength(1);
    const write = await adapter.write({ items: [{ address: temperature, value: 23 }] });
    expect(write.results[0]?.ok).toBe(true);
    expect(transport.requests[1]?.body).toContain('"temperature"');
    expect(safeEndpoint("https://example.invalid/path?token=secret")).toBe(
      "https://example.invalid/path"
    );
    await adapter.dispose();
    await expect(adapter.read({ addresses: [temperature] })).rejects.toThrow(/disposed/);
  });

  it("rejects insecure endpoints, embedded credentials, and secret static headers", () => {
    const base = {
      identity: { id: "rest-main", type: "rest" },
      response: { points: [{ address: temperature, path: ["value"] }] }
    } as const;
    expect(() =>
      createRestDataSourceAdapter({ ...base, endpoint: { url: "http://example.invalid" } })
    ).toThrow(/HTTPS/);
    expect(() =>
      createRestDataSourceAdapter({
        ...base,
        endpoint: { url: "https://user:pass@example.invalid" }
      })
    ).toThrow(/credentials/);
    expect(() =>
      createRestDataSourceAdapter({
        ...base,
        endpoint: {
          url: "https://example.invalid",
          headers: { Authorization: "secret" }
        }
      })
    ).toThrow(/authentication provider/);
  });
});
