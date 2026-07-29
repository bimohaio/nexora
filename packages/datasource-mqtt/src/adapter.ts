import {
  DataSourceError,
  SystemDataSourceScheduler,
  assertOperationAllowed,
  createDataSourceLifecycleController,
  createSubscriptionManager,
  dataPointAddressKey,
  normalizeAddress,
  normalizeDataPointValue,
  type BrowseRequest,
  type BrowseResult,
  type DataPointAddress,
  type DataSourceCapabilities,
  type DataSourceEvent,
  type DataSourceEventListener,
  type DataSourcePermissions,
  type DataSourceStatus,
  type ManagedSubscriptionHandle,
  type NormalizedSubscriptionRequest,
  type ReadRequest,
  type ReadResult,
  type SubscriptionActivationContext,
  type SubscriptionHandle,
  type SubscriptionRequest,
  type WriteItemResult,
  type WriteRequest,
  type WriteResult
} from "@web-scada/datasource-core";
import type { JsonValue } from "@web-scada/core";
import type {
  MqttDataSource,
  MqttDataSourceConfig,
  MqttMessageMapping,
  MqttPayloadDecoder,
  MqttPublishMapping,
  MqttSubscriptionDefinition,
  MqttTransport,
  MqttTransportMessage
} from "./contracts.js";
import { mqttTopicMatchesFilter } from "./topic.js";
import {
  compileMqttTopicTemplate,
  extractMqttPath,
  safeMqttEndpoint,
  validateMqttConfig
} from "./validation.js";

interface ActiveSubscription {
  readonly id: string;
  readonly request: Readonly<NormalizedSubscriptionRequest>;
  readonly listener: DataSourceEventListener;
  readonly definitions: readonly MqttSubscriptionDefinition[];
  readonly generation: number;
  readonly acceptedRetained: Set<string>;
  closed: boolean;
}

const CAPABILITIES_WITH_WRITE: DataSourceCapabilities = Object.freeze({
  connect: true,
  disconnect: true,
  subscribe: true,
  read: false,
  write: true,
  browse: false,
  batchRead: false,
  batchWrite: true,
  historyRead: false,
  metadata: true
});
const CAPABILITIES_READ_ONLY: DataSourceCapabilities = Object.freeze({
  ...CAPABILITIES_WITH_WRITE,
  write: false,
  batchWrite: false
});
const utf8 = new TextDecoder("utf-8", { fatal: true });
const utf8Encoder = new TextEncoder();

export function createMqttDataSourceAdapter(
  config: Readonly<MqttDataSourceConfig>
): MqttDataSource {
  return new MqttAdapter(config);
}

class MqttAdapter implements MqttDataSource {
  public readonly identity;
  public readonly capabilities: DataSourceCapabilities;
  public readonly permissions: DataSourcePermissions;
  readonly #config: Readonly<MqttDataSourceConfig>;
  readonly #scheduler;
  readonly #lifecycle;
  readonly #subscriptions;
  readonly #active = new Map<string, ActiveSubscription>();
  readonly #topicCompilers = new WeakMap<
    MqttMessageMapping,
    (topic: string) => string | undefined
  >();
  readonly #queue: MqttTransportMessage[] = [];
  #transport: MqttTransport | undefined;
  #transportGeneration = -1;
  #nextSubscription = 1;
  #processing = false;
  #disposed = false;
  #explicitClose = false;
  #inflightPublishes = 0;

  public constructor(config: Readonly<MqttDataSourceConfig>) {
    validateMqttConfig(config);
    this.#config = config;
    this.identity = Object.freeze({ ...config.identity });
    this.capabilities =
      (config.publish?.length ?? 0) > 0 ? CAPABILITIES_WITH_WRITE : CAPABILITIES_READ_ONLY;
    this.permissions = Object.freeze({
      READ: false,
      WRITE: config.permissions?.publish === true,
      SUBSCRIBE: config.permissions?.subscribe !== false,
      BROWSE: false,
      HISTORY_READ: false
    });
    this.#scheduler = config.scheduler ?? new SystemDataSourceScheduler();
    this.#lifecycle = createDataSourceLifecycleController({
      adapterId: this.identity.id,
      scheduler: this.#scheduler,
      connectTimeoutMs: config.connection.connectTimeoutMs ?? 10_000,
      ...(config.reconnectPolicy ? { reconnectPolicy: config.reconnectPolicy } : {}),
      operations: {
        connect: (context) => this.#open(context.generation, context.signal),
        disconnect: () => this.#closeTransport()
      },
      onDiagnostic: (diagnostic) => {
        this.#diagnostic(diagnostic.code, diagnostic.severity, diagnostic.message);
      }
    });
    this.#subscriptions = createSubscriptionManager({
      adapterId: this.identity.id,
      lifecycle: this.#lifecycle,
      now: () => this.#scheduler.now(),
      transport: {
        activate: (request, listener, context) =>
          this.#activateSubscription(request, listener, context)
      },
      onDiagnostic: (diagnostic) => {
        this.#diagnostic(diagnostic.code, diagnostic.severity, diagnostic.message);
      }
    });
  }

  public connect(): Promise<void> {
    this.#assertActive();
    this.#explicitClose = false;
    return this.#lifecycle.connect();
  }

  public disconnect(): Promise<void> {
    this.#assertActive();
    this.#explicitClose = true;
    return this.#lifecycle.disconnect();
  }

  public getStatus(): Readonly<DataSourceStatus> {
    const status = this.#lifecycle.status;
    return Object.freeze({
      state: status.state,
      changedAt: status.changedAt,
      attempt: status.attempt,
      ...(status.lastError
        ? {
            diagnostic: Object.freeze({
              code: "DATASOURCE_VALIDATION_ERROR" as const,
              severity: "error" as const,
              message: status.lastError.message,
              timestamp: status.changedAt
            })
          }
        : {})
    });
  }

  public subscribe(
    request: Readonly<SubscriptionRequest>,
    listener: DataSourceEventListener
  ): Promise<ManagedSubscriptionHandle> {
    this.#assertActive();
    assertOperationAllowed("subscribe", this.capabilities, this.permissions);
    return this.#subscriptions.subscribe(request, listener);
  }

  public read(_request: Readonly<ReadRequest>): Promise<Readonly<ReadResult>> {
    assertOperationAllowed("read", this.capabilities, this.permissions);
    return Promise.resolve(
      Object.freeze({ values: Object.freeze([]), failures: Object.freeze([]) })
    );
  }

  public async write(request: Readonly<WriteRequest>): Promise<Readonly<WriteResult>> {
    this.#assertActive();
    assertOperationAllowed("write", this.capabilities, this.permissions);
    const results: WriteItemResult[] = [];
    for (const item of request.items) {
      const address = normalizeAddress(item.address);
      const mapping = this.#config.publish?.find(
        (candidate) => dataPointAddressKey(candidate.address) === dataPointAddressKey(address)
      );
      if (!mapping) {
        results.push({
          ok: false,
          address,
          error: this.#error(
            "DATASOURCE_WRITE_ERROR",
            "No MQTT publish mapping exists for the requested address.",
            "write",
            false,
            address
          ).toJSON()
        });
        continue;
      }
      try {
        await this.#publish(mapping, item.value, request.timeoutMs, request.correlationId);
        results.push(Object.freeze({ ok: true, address }));
      } catch (cause) {
        const error =
          cause instanceof DataSourceError
            ? cause
            : this.#error("DATASOURCE_WRITE_ERROR", "MQTT publish failed.", "write", true, address);
        results.push(Object.freeze({ ok: false, address, error: error.toJSON() }));
      }
    }
    return Object.freeze({ results: Object.freeze(results) });
  }

  public browse(_request: Readonly<BrowseRequest>): Promise<Readonly<BrowseResult>> {
    assertOperationAllowed("browse", this.capabilities, this.permissions);
    return Promise.resolve(Object.freeze({ points: Object.freeze([]) }));
  }

  public async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#explicitClose = true;
    this.#queue.length = 0;
    await this.#subscriptions.dispose();
    await this.#lifecycle.dispose();
    await this.#closeTransport();
    this.#diagnostic("DATASOURCE_MQTT_DISPOSED", "info", "MQTT adapter disposed.");
  }

  async #open(generation: number, signal: AbortSignal): Promise<void> {
    const endpoint = safeMqttEndpoint(this.#config.connection.url);
    this.#diagnostic("DATASOURCE_MQTT_CONNECTING", "info", "MQTT connection attempt started.");
    let credentials:
      | Awaited<ReturnType<NonNullable<MqttDataSourceConfig["credentialProvider"]>["resolve"]>>
      | undefined;
    try {
      credentials = await this.#config.credentialProvider?.resolve(
        {
          adapterId: this.identity.id,
          endpoint,
          ...(this.#config.connection.usernameCredentialRef
            ? { usernameCredentialRef: this.#config.connection.usernameCredentialRef }
            : {}),
          ...(this.#config.connection.passwordCredentialRef
            ? { passwordCredentialRef: this.#config.connection.passwordCredentialRef }
            : {}),
          ...(this.#config.connection.tlsConfigRef
            ? { tlsConfigRef: this.#config.connection.tlsConfigRef }
            : {})
        },
        signal
      );
    } catch {
      throw this.#error(
        "DATASOURCE_CONNECTION_ERROR",
        "MQTT credential resolution failed.",
        "connect",
        false
      );
    }
    if (signal.aborted)
      throw this.#error(
        "DATASOURCE_CONNECTION_ERROR",
        "MQTT connection was cancelled.",
        "connect",
        true
      );
    const transport = this.#config.transportFactory.create();
    this.#transport = transport;
    this.#transportGeneration = generation;
    const authoritative = (): boolean =>
      !this.#disposed &&
      this.#transport === transport &&
      this.#transportGeneration === generation &&
      !signal.aborted;
    transport.setHandlers({
      message: (message) => {
        if (authoritative()) this.#enqueue(message);
      },
      close: () => {
        if (!authoritative() || this.#explicitClose) return;
        void this.#detachTransport(transport);
        this.#lifecycle.connectionLost(
          this.#error(
            "DATASOURCE_CONNECTION_ERROR",
            "MQTT connection closed unexpectedly.",
            "connect",
            true
          ),
          generation
        );
      },
      error: () => {
        if (authoritative())
          this.#diagnostic(
            "DATASOURCE_MQTT_TRANSPORT_ERROR",
            "warning",
            "MQTT transport reported an error."
          );
      }
    });
    signal.addEventListener(
      "abort",
      () => {
        void this.#detachTransport(transport);
      },
      { once: true }
    );
    try {
      const connack = await transport.connect(
        {
          url: this.#config.connection.url,
          protocolVersion: this.#config.connection.protocolVersion,
          clientId: this.#config.connection.clientId,
          cleanStart: this.#config.connection.cleanStart,
          ...(this.#config.connection.sessionExpiryIntervalSeconds === undefined
            ? {}
            : {
                sessionExpiryIntervalSeconds: this.#config.connection.sessionExpiryIntervalSeconds
              }),
          keepAliveSeconds: this.#config.connection.keepAliveSeconds ?? 60,
          ...(credentials?.username === undefined ? {} : { username: credentials.username }),
          ...(credentials?.password === undefined ? {} : { password: credentials.password }),
          ...(credentials?.tls === undefined ? {} : { tls: credentials.tls }),
          ...(this.#config.connection.will ? { will: this.#config.connection.will } : {})
        },
        signal
      );
      if (!authoritative())
        throw this.#error(
          "DATASOURCE_CONNECTION_ERROR",
          "Stale MQTT connection acknowledgement ignored.",
          "connect",
          true
        );
      if (connack.reasonCode !== 0) throw this.#connackError(connack.reasonCode);
      this.#diagnostic(
        "DATASOURCE_MQTT_CONNACK_ACCEPTED",
        "info",
        connack.sessionPresent ? "MQTT session resumed." : "MQTT session established."
      );
    } catch (cause) {
      await this.#detachTransport(transport);
      if (cause instanceof DataSourceError) throw cause;
      throw this.#error("DATASOURCE_CONNECTION_ERROR", "MQTT connection failed.", "connect", true);
    } finally {
      credentials = undefined;
    }
  }

  async #activateSubscription(
    request: Readonly<NormalizedSubscriptionRequest>,
    listener: DataSourceEventListener,
    context: Readonly<SubscriptionActivationContext>
  ): Promise<SubscriptionHandle> {
    const transport = this.#transport;
    if (!transport?.connected || context.generation !== this.#transportGeneration)
      throw this.#error(
        "DATASOURCE_SUBSCRIPTION_ERROR",
        "MQTT transport is not connected.",
        "subscribe",
        true
      );
    const definitions = this.#config.subscriptions.filter((definition) =>
      this.#definitionCanServe(definition, request)
    );
    if (definitions.length === 0)
      throw this.#error(
        "DATASOURCE_SUBSCRIPTION_ERROR",
        "No MQTT subscription mapping can serve the requested addresses.",
        "subscribe",
        false
      );
    const acknowledgements = await transport.subscribe(
      definitions.map((definition) => ({
        topicFilter: definition.topicFilter,
        qos: definition.qos,
        ...(definition.noLocal === undefined ? {} : { noLocal: definition.noLocal }),
        ...(definition.retainAsPublished === undefined
          ? {}
          : { retainAsPublished: definition.retainAsPublished }),
        ...(definition.retainHandling === undefined
          ? {}
          : { retainHandling: definition.retainHandling })
      })),
      context.signal
    );
    if (
      context.signal.aborted ||
      context.generation !== this.#transportGeneration ||
      transport !== this.#transport
    )
      throw this.#error(
        "DATASOURCE_SUBSCRIPTION_ERROR",
        "Stale MQTT subscription acknowledgement ignored.",
        "subscribe",
        true
      );
    const granted = new Set(
      acknowledgements
        .filter((ack) => ack.reasonCode <= 2 && ack.grantedQos !== undefined)
        .map((ack) => ack.topicFilter)
    );
    const activeDefinitions = definitions.filter((definition) =>
      granted.has(definition.topicFilter)
    );
    if (activeDefinitions.length === 0)
      throw this.#error(
        "DATASOURCE_SUBSCRIPTION_ERROR",
        "MQTT broker rejected the subscription.",
        "subscribe",
        false
      );
    if (activeDefinitions.length !== definitions.length)
      this.#diagnostic(
        "DATASOURCE_MQTT_SUBACK_PARTIAL",
        "warning",
        "MQTT broker rejected part of a subscription request."
      );
    const id = `${this.identity.id}:mqtt-subscription:${this.#nextSubscription++}`;
    const active: ActiveSubscription = {
      id,
      request,
      listener,
      definitions: Object.freeze(activeDefinitions),
      generation: context.generation,
      acceptedRetained: new Set(),
      closed: false
    };
    this.#active.set(id, active);
    context.signal.addEventListener(
      "abort",
      () => {
        active.closed = true;
        this.#active.delete(id);
      },
      { once: true }
    );
    this.#diagnostic("DATASOURCE_MQTT_SUBSCRIBED", "info", "MQTT subscription granted.");
    return {
      id,
      get closed() {
        return active.closed;
      },
      unsubscribe: async () => {
        if (active.closed) return;
        active.closed = true;
        this.#active.delete(id);
        if (this.#transport === transport && transport.connected)
          await transport.unsubscribe(
            active.definitions.map((definition) => definition.topicFilter)
          );
      }
    };
  }

  #definitionCanServe(
    definition: Readonly<MqttSubscriptionDefinition>,
    request: Readonly<NormalizedSubscriptionRequest>
  ): boolean {
    if (definition.mapping.address)
      return request.addresses.some(
        (address) =>
          definition.mapping.address !== undefined &&
          dataPointAddressKey(address) === dataPointAddressKey(definition.mapping.address)
      );
    return request.addresses.some((address) => address.sourceId === this.identity.id);
  }

  #enqueue(message: Readonly<MqttTransportMessage>): void {
    if (message.payload.byteLength > (this.#config.limits?.payloadBytes ?? 1_048_576)) {
      this.#diagnostic(
        "DATASOURCE_MQTT_PAYLOAD_REJECTED",
        "warning",
        "MQTT payload exceeds the configured size limit.",
        message.topic
      );
      return;
    }
    const limit = this.#config.limits?.inboundQueue ?? 1_000;
    if (this.#queue.length >= limit) {
      this.#diagnostic(
        "DATASOURCE_MQTT_QUEUE_OVERFLOW",
        "error",
        "MQTT inbound queue limit was reached.",
        message.topic
      );
      return;
    }
    this.#queue.push(message);
    if (!this.#processing) void this.#processQueue();
  }

  async #processQueue(): Promise<void> {
    this.#processing = true;
    while (!this.#disposed && this.#queue.length > 0) {
      const message = this.#queue.shift();
      await Promise.resolve();
      if (message) this.#processMessage(message);
    }
    this.#processing = false;
  }

  #processMessage(message: Readonly<MqttTransportMessage>): void {
    const generation = this.#transportGeneration;
    for (const active of [...this.#active.values()]) {
      if (active.closed || active.generation !== generation) continue;
      for (const definition of active.definitions) {
        if (!mqttTopicMatchesFilter(definition.topicFilter, message.topic)) continue;
        if (message.retain && definition.retainedPolicy === "IGNORE") continue;
        if (
          message.retain &&
          definition.retainedPolicy === "ACCEPT_INITIAL_ONLY" &&
          active.acceptedRetained.has(definition.topicFilter)
        )
          continue;
        if (message.retain) active.acceptedRetained.add(definition.topicFilter);
        try {
          const decoded = decodeMqttPayload(message.payload, definition.mapping.decoder);
          const batch = definition.mapping.batchPath
            ? extractMqttPath(decoded, definition.mapping.batchPath)
            : [decoded];
          if (!Array.isArray(batch)) throw new Error("MQTT batch mapping is not an array.");
          if (batch.length > (this.#config.limits?.batchItems ?? 1_000))
            throw new Error("MQTT batch exceeds configured limit.");
          for (const item of batch) this.#emitMapped(active, definition, message, item);
        } catch {
          this.#diagnostic(
            "DATASOURCE_MQTT_MESSAGE_REJECTED",
            "warning",
            "MQTT payload could not be decoded or mapped.",
            message.topic
          );
        }
      }
    }
  }

  #emitMapped(
    active: ActiveSubscription,
    definition: Readonly<MqttSubscriptionDefinition>,
    message: Readonly<MqttTransportMessage>,
    item: unknown
  ): void {
    const mapping = definition.mapping;
    const address = this.#mapAddress(mapping, message.topic, item);
    if (!address) return;
    const subscribed = active.request.addresses.find(
      (candidate) => dataPointAddressKey(candidate) === dataPointAddressKey(address)
    );
    if (!subscribed) return;
    const sourceTimestamp = normalizeMappedTimestamp(
      extractMqttPath(item, mapping.timestampPath),
      mapping.timestampUnit
    );
    const now = this.#scheduler.now();
    const value = normalizeDataPointValue(
      {
        address: subscribed,
        value: extractMqttPath(item, mapping.valuePath),
        quality: mapping.qualityPath ? extractMqttPath(item, mapping.qualityPath) : "GOOD",
        ...(sourceTimestamp === undefined ? {} : { sourceTimestamp }),
        ...(mapping.sequencePath ? { sequence: extractMqttPath(item, mapping.sequencePath) } : {}),
        metadata: {
          ...(this.#config.metadata ?? {}),
          ...(definition.metadata ?? {}),
          mqttTopic: message.topic,
          mqttQos: message.qos,
          mqttRetain: message.retain,
          mqttDup: message.dup,
          mqttProtocolVersion: this.#config.connection.protocolVersion,
          mqttConnectionGeneration: active.generation,
          ...(message.packetId === undefined ? {} : { mqttPacketId: message.packetId }),
          ...(message.properties?.contentType === undefined
            ? {}
            : { mqttContentType: message.properties.contentType.slice(0, 128) }),
          ...(message.properties?.payloadFormatIndicator === undefined
            ? {}
            : { mqttPayloadFormatIndicator: message.properties.payloadFormatIndicator })
        }
      },
      { receivedTimestamp: now }
    );
    const event: DataSourceEvent = Object.freeze({
      type: "VALUE",
      adapter: this.identity,
      timestamp: now,
      ...(value.sequence === undefined ? {} : { sequence: value.sequence }),
      value
    });
    try {
      active.listener(event);
    } catch {
      this.#diagnostic("DATASOURCE_MQTT_LISTENER_ERROR", "warning", "MQTT event listener failed.");
    }
  }

  #mapAddress(
    mapping: Readonly<MqttMessageMapping>,
    topic: string,
    item: unknown
  ): ReturnType<typeof normalizeAddress> | undefined {
    if (mapping.address) return normalizeAddress(mapping.address);
    if (mapping.pointKeyPath) {
      const key = extractMqttPath(item, mapping.pointKeyPath);
      if (typeof key !== "string" || key === "" || key.length > 512) return undefined;
      return normalizeAddress({ sourceId: this.identity.id, key });
    }
    if (!mapping.topicTemplate || !mapping.addressKeyTemplate) return undefined;
    let compile = this.#topicCompilers.get(mapping);
    if (!compile) {
      compile = compileMqttTopicTemplate(mapping.topicTemplate, mapping.addressKeyTemplate);
      this.#topicCompilers.set(mapping, compile);
    }
    const key = compile(topic);
    return key ? normalizeAddress({ sourceId: this.identity.id, key }) : undefined;
  }

  async #publish(
    mapping: Readonly<MqttPublishMapping>,
    value: JsonValue,
    requestTimeout?: number,
    correlationId?: string
  ): Promise<void> {
    const transport = this.#transport;
    if (!transport?.connected)
      throw this.#error(
        "DATASOURCE_NOT_CONNECTED",
        "MQTT writes are rejected while disconnected.",
        "write",
        true,
        mapping.address
      );
    if (this.#inflightPublishes >= (this.#config.limits?.maxInflightPublishes ?? 32))
      throw this.#error(
        "DATASOURCE_WRITE_ERROR",
        "MQTT publish inflight limit was reached.",
        "write",
        true,
        mapping.address
      );
    const serialized =
      mapping.payloadType === "json"
        ? JSON.stringify(value)
        : typeof value === "string"
          ? value
          : JSON.stringify(value);
    const payload = utf8Encoder.encode(serialized);
    if (payload.byteLength > (this.#config.limits?.payloadBytes ?? 1_048_576))
      throw this.#error(
        "DATASOURCE_WRITE_ERROR",
        "MQTT publish payload exceeds the configured size limit.",
        "write",
        false,
        mapping.address
      );
    this.#inflightPublishes++;
    const abort = new AbortController();
    const timeoutMs = requestTimeout ?? this.#config.limits?.publishTimeoutMs ?? 10_000;
    const timeout = this.#scheduler.schedule(timeoutMs, () => {
      abort.abort();
    });
    try {
      const acknowledgement = await transport.publish(
        {
          topic: mapping.topic,
          payload,
          qos: mapping.qos ?? 0,
          retain: mapping.retain === true,
          ...(correlationId
            ? { properties: { userProperties: { correlationId: correlationId.slice(0, 128) } } }
            : {})
        },
        abort.signal
      );
      if (abort.signal.aborted)
        throw this.#error(
          "DATASOURCE_TIMEOUT",
          "MQTT publish acknowledgement timed out.",
          "write",
          true,
          mapping.address
        );
      if (acknowledgement.reasonCode !== undefined && acknowledgement.reasonCode >= 128)
        throw this.#error(
          "DATASOURCE_WRITE_ERROR",
          "MQTT broker rejected the publish.",
          "write",
          false,
          mapping.address
        );
    } finally {
      timeout.cancel();
      this.#inflightPublishes--;
    }
  }

  #connackError(reasonCode: number): DataSourceError {
    const authFailure = [4, 5, 134, 135].includes(reasonCode);
    return this.#error(
      authFailure ? "DATASOURCE_ACCESS_DENIED" : "DATASOURCE_CONNECTION_ERROR",
      authFailure
        ? "MQTT broker rejected authentication or authorization."
        : "MQTT broker rejected the connection.",
      "connect",
      !authFailure,
      undefined,
      { mqttReasonCode: reasonCode }
    );
  }

  async #closeTransport(): Promise<void> {
    this.#queue.length = 0;
    this.#active.clear();
    const transport = this.#transport;
    this.#transport = undefined;
    this.#transportGeneration = -1;
    if (!transport) return;
    transport.clearHandlers();
    try {
      await transport.disconnect();
    } finally {
      await transport.dispose();
    }
  }

  async #detachTransport(transport: MqttTransport): Promise<void> {
    if (this.#transport === transport) {
      this.#transport = undefined;
      this.#transportGeneration = -1;
    }
    transport.clearHandlers();
    await transport.dispose();
  }

  #error(
    code: ConstructorParameters<typeof DataSourceError>[0],
    message: string,
    operation: "connect" | "subscribe" | "write",
    recoverable: boolean,
    address?: DataPointAddress,
    context: Readonly<Record<string, JsonValue>> = {}
  ): DataSourceError {
    return new DataSourceError(code, message, {
      adapterId: this.identity.id,
      operation,
      recoverable,
      timestamp: this.#scheduler.now(),
      ...(address ? { address } : {}),
      context: {
        endpoint: safeMqttEndpoint(this.#config.connection.url),
        ...context
      }
    });
  }

  #diagnostic(
    code: string,
    severity: "info" | "warning" | "error",
    message: string,
    topic?: string
  ): void {
    try {
      this.#config.onDiagnostic?.(
        Object.freeze({
          code,
          severity,
          message,
          timestamp: this.#scheduler.now(),
          endpoint: safeMqttEndpoint(this.#config.connection.url),
          ...(topic ? { topic: redactTopic(topic, this.#config.topicRedaction ?? "REDACT") } : {})
        })
      );
    } catch {
      // Diagnostic consumers never own adapter authority.
    }
  }

  #assertActive(): void {
    if (this.#disposed)
      throw this.#error("DATASOURCE_DISPOSED", "MQTT adapter is disposed.", "connect", false);
  }
}

export function decodeMqttPayload(
  payload: Uint8Array,
  decoder: Readonly<MqttPayloadDecoder>
): JsonValue {
  if (decoder.type === "base64") return encodeBase64(payload);
  let text: string;
  try {
    text = utf8.decode(payload);
  } catch {
    throw new DataSourceError("DATASOURCE_PARSE_ERROR", "MQTT payload is not valid UTF-8.");
  }
  if (decoder.type === "text") return text;
  if (decoder.type === "json") {
    try {
      return JSON.parse(text) as JsonValue;
    } catch {
      throw new DataSourceError("DATASOURCE_PARSE_ERROR", "MQTT payload is not valid JSON.");
    }
  }
  if (decoder.type === "number") {
    if (
      text.trim() !== text ||
      text === "" ||
      !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text)
    )
      throw new DataSourceError("DATASOURCE_PARSE_ERROR", "MQTT payload is not a strict number.");
    const value = Number(text);
    if (!Number.isFinite(value))
      throw new DataSourceError("DATASOURCE_PARSE_ERROR", "MQTT numeric payload is not finite.");
    return value;
  }
  const normalize = decoder.caseSensitive
    ? (value: string): string => value
    : (value: string): string => value.toLowerCase();
  const actual = normalize(text);
  if (actual === normalize(decoder.trueToken ?? "true")) return true;
  if (actual === normalize(decoder.falseToken ?? "false")) return false;
  throw new DataSourceError(
    "DATASOURCE_PARSE_ERROR",
    "MQTT payload is not a configured boolean token."
  );
}

function normalizeMappedTimestamp(
  value: unknown,
  unit: MqttMessageMapping["timestampUnit"]
): number | undefined {
  if (value === undefined) return undefined;
  if (unit === "iso8601") {
    if (typeof value !== "string") throw new Error("invalid timestamp");
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) throw new Error("invalid timestamp");
    return parsed;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new Error("invalid timestamp");
  return unit === "seconds" ? value * 1_000 : value;
}

function redactTopic(topic: string, policy: "FULL" | "PREFIX_ONLY" | "REDACT"): string {
  if (policy === "FULL") return topic.slice(0, 512);
  if (policy === "PREFIX_ONLY") return `${topic.split("/")[0] ?? ""}/…`;
  return "[redacted topic]";
}

function encodeBase64(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    if (a === undefined) break;
    const hasB = index + 1 < bytes.length;
    const hasC = index + 2 < bytes.length;
    const b = hasB ? (bytes[index + 1] ?? 0) : 0;
    const c = hasC ? (bytes[index + 2] ?? 0) : 0;
    result += alphabet.charAt(a >> 2);
    result += alphabet.charAt(((a & 3) << 4) | (b >> 4));
    result += hasB ? alphabet.charAt(((b & 15) << 2) | (c >> 6)) : "=";
    result += hasC ? alphabet.charAt(c & 63) : "=";
  }
  return result;
}
