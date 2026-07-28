import { describe, expect, it } from "vitest";
import type {
  WebSocketTransport,
  WebSocketTransportClose,
  WebSocketTransportFactory
} from "./contracts.js";
import { createWebSocketDataSourceAdapter } from "./index.js";

class FakeSocket implements WebSocketTransport {
  public open = false;
  public sent: string[] = [];
  public handlers:
    | {
        open: () => void;
        message: (data: string | ArrayBuffer) => void;
        close: (event: WebSocketTransportClose) => void;
        error: (error: unknown) => void;
      }
    | undefined;
  public setHandlers(handlers: NonNullable<FakeSocket["handlers"]>): void {
    this.handlers = handlers;
  }
  public clearHandlers(): void {
    this.handlers = undefined;
  }
  public send(data: string): void {
    this.sent.push(data);
  }
  public close(): void {
    this.open = false;
  }
  public emitOpen(): void {
    this.open = true;
    this.handlers?.open();
  }
  public emit(data: unknown): void {
    this.handlers?.message(JSON.stringify(data));
  }
}

class FakeFactory implements WebSocketTransportFactory {
  public readonly sockets: FakeSocket[] = [];
  public connect(): FakeSocket {
    const socket = new FakeSocket();
    this.sockets.push(socket);
    return socket;
  }
}

describe("WebSocket adapter", () => {
  it("connects, sends subscription commands, filters and normalizes ordered messages", async () => {
    const factory = new FakeFactory();
    const adapter = createWebSocketDataSourceAdapter({
      identity: { id: "ws-main", type: "websocket" },
      endpoint: { url: "wss://example.invalid/live?token=hidden" },
      mapping: {
        batchPath: ["values"],
        keyPath: ["key"],
        valuePath: ["value"],
        timestampPath: ["timestamp"],
        sequencePath: ["sequence"]
      },
      commands: { subscribeType: "subscribe", unsubscribeType: "unsubscribe" },
      transportFactory: factory
    });
    const connected = adapter.connect();
    await Promise.resolve();
    factory.sockets[0]?.emitOpen();
    await connected;
    const values: unknown[] = [];
    const handle = await adapter.subscribe(
      { addresses: [{ sourceId: "ws-main", key: "temperature" }] },
      (event) => {
        if (event.type === "VALUE") values.push(event.value.value);
      }
    );
    expect(factory.sockets[0]?.sent[0]).toContain('"subscribe"');
    factory.sockets[0]?.emit({
      values: [
        { key: "pressure", value: 3 },
        { key: "temperature", value: 20, timestamp: 1000, sequence: 1 }
      ]
    });
    factory.sockets[0]?.emit({ values: [{ key: "temperature", value: 21, sequence: 2 }] });
    await Promise.resolve();
    await Promise.resolve();
    expect(values).toEqual([20, 21]);
    await handle.unsubscribe();
    expect(factory.sockets[0]?.sent[1]).toContain('"unsubscribe"');
    await adapter.dispose();
  });

  it("rejects insecure, credential-bearing, and unsafe mapping configurations", () => {
    const make = (
      url: string,
      keyPath: readonly (string | number)[] = ["key"]
    ): ReturnType<typeof createWebSocketDataSourceAdapter> =>
      createWebSocketDataSourceAdapter({
        identity: { id: "ws-main", type: "websocket" },
        endpoint: { url },
        mapping: { keyPath, valuePath: ["value"] },
        transportFactory: new FakeFactory()
      });
    expect(() => make("ws://example.invalid")).toThrow(/WSS/);
    expect(() => make("wss://user:pass@example.invalid")).toThrow(/credentials/);
    expect(() => make("wss://example.invalid", ["__proto__"])).toThrow(/unsafe/);
  });
});
