import { describe, expect, it, vi } from "vitest";
import type { DataSourceEvent } from "@web-scada/datasource-core";
import type {
  MqttConnAck,
  MqttDataSourceConfig,
  MqttPublishAcknowledgement,
  MqttSubscriptionAcknowledgement,
  MqttTransport,
  MqttTransportConnectOptions,
  MqttTransportHandlers,
  MqttTransportMessage,
  MqttTransportPublish,
  MqttTransportSubscription
} from "./contracts.js";
import {
  createMqttDataSourceAdapter,
  decodeMqttPayload,
  mqttTopicMatchesFilter,
  safeMqttEndpoint,
  validateMqttTopicFilter,
  validateMqttTopicName
} from "./index.js";

class FakeMqttTransport implements MqttTransport {
  public connected = false;
  public handlers: MqttTransportHandlers | undefined;
  public connectOptions: MqttTransportConnectOptions | undefined;
  public subscriptions: readonly MqttTransportSubscription[] = [];
  public unsubscribed: string[][] = [];
  public published: MqttTransportPublish[] = [];
  public sessionPresent = false;

  public connect(options: Readonly<MqttTransportConnectOptions>): Promise<Readonly<MqttConnAck>> {
    this.connectOptions = options;
    this.connected = true;
    return Promise.resolve({ sessionPresent: this.sessionPresent, reasonCode: 0 });
  }
  public disconnect(): Promise<void> {
    this.connected = false;
    return Promise.resolve();
  }
  public subscribe(
    subscriptions: readonly MqttTransportSubscription[]
  ): Promise<readonly MqttSubscriptionAcknowledgement[]> {
    this.subscriptions = subscriptions;
    return Promise.resolve(
      subscriptions.map(({ topicFilter, qos }) => ({
        topicFilter,
        grantedQos: qos,
        reasonCode: qos
      }))
    );
  }
  public unsubscribe(topicFilters: readonly string[]): Promise<void> {
    this.unsubscribed.push([...topicFilters]);
    return Promise.resolve();
  }
  public publish(
    message: Readonly<MqttTransportPublish>
  ): Promise<Readonly<MqttPublishAcknowledgement>> {
    this.published.push(message);
    return Promise.resolve({ qos: message.qos, reasonCode: 0 });
  }
  public setHandlers(handlers: Readonly<MqttTransportHandlers>): void {
    this.handlers = handlers;
  }
  public clearHandlers(): void {
    this.handlers = undefined;
  }
  public dispose(): Promise<void> {
    this.connected = false;
    return Promise.resolve();
  }
  public emit(message: Readonly<MqttTransportMessage>): void {
    this.handlers?.message(message);
  }
}

const address = { sourceId: "mqtt-main", key: "line1.temperature" } as const;

function createConfig(transport: FakeMqttTransport): MqttDataSourceConfig {
  return {
    identity: { id: "mqtt-main", type: "mqtt" },
    connection: {
      url: "mqtts://example.invalid:8883?secret=redacted",
      protocolVersion: 5 as const,
      clientId: "web-scada-test",
      cleanStart: false,
      sessionExpiryIntervalSeconds: 3600
    },
    subscriptions: [
      {
        topicFilter: "factory/+/temperature",
        qos: 1 as const,
        mapping: {
          address,
          decoder: { type: "json" as const },
          valuePath: ["value"],
          qualityPath: ["quality"],
          timestampPath: ["timestamp"],
          sequencePath: ["sequence"]
        }
      }
    ],
    publish: [
      {
        address,
        topic: "factory/line1/temperature/set",
        payloadType: "json" as const,
        qos: 1 as const
      }
    ],
    permissions: { subscribe: true, publish: true },
    transportFactory: {
      create: () => transport
    }
  } as const;
}

describe("MQTT topics and decoders", () => {
  it("validates MQTT filters and follows wildcard and system-topic semantics", () => {
    expect(mqttTopicMatchesFilter("factory/+/temperature", "factory//temperature")).toBe(true);
    expect(mqttTopicMatchesFilter("factory/#", "factory")).toBe(true);
    expect(mqttTopicMatchesFilter("#", "$SYS/status")).toBe(false);
    expect(mqttTopicMatchesFilter("$SYS/#", "$SYS/status")).toBe(true);
    expect(mqttTopicMatchesFilter("$share/workers/factory/+", "factory/status")).toBe(true);
    expect(() => {
      validateMqttTopicFilter("factory/te+mp");
    }).toThrow(/entire topic level/);
    expect(() => {
      validateMqttTopicFilter("factory/#/state");
    }).toThrow(/final/);
    expect(() => {
      validateMqttTopicName("factory/+");
    }).toThrow(/wildcard/);
  });

  it("decodes JSON, strict numbers, booleans, UTF-8 text, and explicit binary base64", () => {
    const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);
    expect(decodeMqttPayload(bytes('{"value":7}'), { type: "json" })).toEqual({ value: 7 });
    expect(decodeMqttPayload(bytes("-12.5e2"), { type: "number" })).toBe(-1250);
    expect(() => decodeMqttPayload(bytes("12x"), { type: "number" })).toThrow(/strict number/);
    expect(
      decodeMqttPayload(bytes("ON"), {
        type: "boolean",
        trueToken: "on",
        falseToken: "off"
      })
    ).toBe(true);
    expect(decodeMqttPayload(new Uint8Array([0, 255]), { type: "base64" })).toBe("AP8=");
    expect(() => decodeMqttPayload(new Uint8Array([0xff]), { type: "text" })).toThrow(/UTF-8/);
  });
});

describe("MQTT adapter", () => {
  it("connects, subscribes, normalizes retained metadata, publishes, and cleans up", async () => {
    const transport = new FakeMqttTransport();
    const diagnostic = vi.fn();
    const adapter = createMqttDataSourceAdapter({
      ...createConfig(transport),
      onDiagnostic: diagnostic
    });
    await adapter.connect();
    expect(transport.connectOptions?.clientId).toBe("web-scada-test");
    const events: DataSourceEvent[] = [];
    const listener = (event: DataSourceEvent): void => {
      events.push(event);
    };
    const subscription = await adapter.subscribe({ addresses: [address] }, listener);
    expect(transport.subscriptions[0]?.topicFilter).toBe("factory/+/temperature");
    transport.emit({
      topic: "factory/line1/temperature",
      payload: new TextEncoder().encode(
        '{"value":42.5,"quality":"GOOD","timestamp":1700000000000,"sequence":4}'
      ),
      qos: 1,
      retain: true,
      dup: true,
      packetId: 7
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event?.type).toBe("VALUE");
    if (event?.type !== "VALUE") throw new Error("Expected a value event.");
    expect(event.value.value).toBe(42.5);
    expect(event.value.metadata).toMatchObject({
      mqttQos: 1,
      mqttRetain: true,
      mqttDup: true,
      mqttPacketId: 7
    });
    const write = await adapter.write({ items: [{ address, value: 55 }] });
    expect(write.results[0]?.ok).toBe(true);
    expect(transport.published[0]).toMatchObject({
      topic: "factory/line1/temperature/set",
      qos: 1,
      retain: false
    });
    await subscription.unsubscribe();
    expect(transport.unsubscribed).toEqual([["factory/+/temperature"]]);
    await adapter.dispose();
    expect(adapter.getStatus().state).toBe("disposed");
    expect(safeMqttEndpoint("mqtts://example.invalid/path?token=secret")).toBe(
      "mqtts://example.invalid/path"
    );
    expect(diagnostic).toHaveBeenCalled();
  });

  it("rejects insecure, secret-bearing, and version-incompatible configuration", () => {
    const transport = new FakeMqttTransport();
    const config = createConfig(transport);
    expect(() =>
      createMqttDataSourceAdapter({
        ...config,
        connection: { ...config.connection, url: "mqtt://example.invalid" }
      })
    ).toThrow(/mqtts or wss/);
    expect(() =>
      createMqttDataSourceAdapter({
        ...config,
        connection: { ...config.connection, url: "mqtts://user:pass@example.invalid" }
      })
    ).toThrow(/embedded credentials/);
    expect(() =>
      createMqttDataSourceAdapter({
        ...config,
        connection: {
          ...config.connection,
          protocolVersion: 4,
          sessionExpiryIntervalSeconds: 10
        }
      })
    ).toThrow(/version 5/);
  });
});
