import type { JsonValue } from "@web-scada/core";
import { readFile } from "node:fs/promises";
import {
  DataSourceError,
  assertOperationAllowed,
  createDataSourceLifecycleController,
  normalizeAddress,
  validateReadRequest,
  validateWriteRequest,
  type BrowseRequest,
  type BrowseResult,
  type DataPointAddress,
  type DataPointFailure,
  type DataPointValue,
  type DataSourceCapabilities,
  type DataSourceEventListener,
  type DataSourcePermissions,
  type DataSourceStatus,
  type ReadRequest,
  type ReadResult,
  type SerializedDataSourceError,
  type SubscriptionHandle,
  type SubscriptionRequest,
  type WriteItemResult,
  type WriteRequest,
  type WriteResult
} from "@web-scada/datasource-core";
import {
  AttributeIds,
  ClientMonitoredItemGroup,
  ClientSubscription,
  DataType,
  MessageSecurityMode,
  OPCUAClient,
  SecurityPolicy,
  TimestampsToReturn,
  UserTokenType,
  Variant,
  VariantArrayType,
  makeBrowsePath,
  resolveNodeId,
  type ClientSession,
  type DataValue,
  type NodeIdLike,
  type UserIdentityInfo
} from "node-opcua";
import { opcUaDataPointAddress, parseOpcUaAddress } from "./addressing.js";
import type {
  OpcUaAdapterConfig,
  OpcUaDataSource,
  OpcUaDiagnosticsSnapshot,
  OpcUaMethodCallRequest,
  OpcUaMethodCallResult,
  OpcUaPointDefinition
} from "./contracts.js";
import { decodeVariant, normalizeDataValue } from "./normalization.js";
import { validateOpcUaConfig } from "./validation.js";

const CAPABILITIES: DataSourceCapabilities = Object.freeze({
  connect: true,
  disconnect: true,
  subscribe: true,
  read: true,
  write: true,
  browse: true,
  batchRead: true,
  batchWrite: true,
  historyRead: false,
  metadata: true
});

export function createOpcUaDataSourceAdapter(
  config: Readonly<OpcUaAdapterConfig>
): OpcUaDataSource {
  return new OpcUaAdapter(config);
}

class OpcUaAdapter implements OpcUaDataSource {
  public readonly identity;
  public readonly capabilities = CAPABILITIES;
  public readonly permissions: DataSourcePermissions;
  readonly #config: Readonly<OpcUaAdapterConfig>;
  readonly #lifecycle;
  readonly #points = new Map<string, Readonly<OpcUaPointDefinition>>();
  readonly #subscriptions = new Map<
    string,
    { subscription: ClientSubscription; group: ClientMonitoredItemGroup; closed: boolean }
  >();
  #client: OPCUAClient | undefined;
  #session: ClientSession | undefined;
  #disposed = false;
  #nextSubscription = 1;
  #stats = {
    reconnectCount: 0,
    completedReads: 0,
    completedWrites: 0,
    lastError: undefined as string | undefined
  };

  constructor(config: Readonly<OpcUaAdapterConfig>) {
    validateOpcUaConfig(config);
    this.#config = config;
    this.identity = Object.freeze({ ...config.identity, type: "opcua" });
    for (const point of config.points ?? [])
      this.#points.set(point.id, Object.freeze({ ...point }));
    const write = config.writes?.enabled === true;
    this.permissions = Object.freeze({
      READ: true,
      WRITE: write,
      SUBSCRIBE: true,
      BROWSE: true,
      HISTORY_READ: false
    });
    this.#lifecycle = createDataSourceLifecycleController({
      adapterId: this.identity.id,
      ...(config.scheduler ? { scheduler: config.scheduler } : {}),
      connectTimeoutMs: config.session?.operationTimeoutMs ?? 10_000,
      ...(config.reconnectPolicy ? { reconnectPolicy: config.reconnectPolicy } : {}),
      operations: {
        connect: ({ signal }) => this.#open(signal),
        disconnect: () => this.#close()
      }
    });
  }

  connect(): Promise<void> {
    this.#active();
    return this.#lifecycle.connect();
  }
  disconnect(): Promise<void> {
    this.#active();
    return this.#lifecycle.disconnect();
  }
  getStatus(): Readonly<DataSourceStatus> {
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
              message: "OPC UA connection failed.",
              timestamp: status.changedAt
            })
          }
        : {})
    });
  }

  async read(request: Readonly<ReadRequest>): Promise<Readonly<ReadResult>> {
    const session = this.#connected("read");
    validateReadRequest(request);
    const values: DataPointValue[] = [],
      failures: DataPointFailure[] = [];
    const batchSize = this.#config.limits?.maxNodesPerRead ?? 100;
    for (let offset = 0; offset < request.addresses.length; offset += batchSize) {
      const addresses = request.addresses.slice(offset, offset + batchSize).map(normalizeAddress);
      try {
        const nodes = await Promise.all(addresses.map((address) => this.#nodeId(address)));
        const results = await session.read(
          nodes.map((nodeId) => ({ nodeId, attributeId: AttributeIds.Value }))
        );
        results.forEach((value, index) => {
          const address = addresses[index];
          if (!address) return;
          if (value.statusCode.isBad())
            failures.push(
              Object.freeze({
                address,
                error: this.#error("DATASOURCE_READ_ERROR", value.statusCode.name, "read", address)
              })
            );
          else values.push(normalizeDataValue(address, value));
        });
      } catch (cause) {
        for (const address of addresses)
          failures.push(
            Object.freeze({
              address,
              error: this.#normalizeError(cause, "read", address)
            })
          );
      }
    }
    this.#stats.completedReads += values.length;
    return Object.freeze({ values: Object.freeze(values), failures: Object.freeze(failures) });
  }

  async write(request: Readonly<WriteRequest>): Promise<Readonly<WriteResult>> {
    const session = this.#connected("write");
    assertOperationAllowed("write", this.capabilities, this.permissions);
    validateWriteRequest(request);
    const results: WriteItemResult[] = [];
    const batchSize = this.#config.limits?.maxNodesPerWrite ?? 100;
    for (let offset = 0; offset < request.items.length; offset += batchSize) {
      const items = request.items.slice(offset, offset + batchSize);
      try {
        const writes = await Promise.all(
          items.map(async (item) => ({
            nodeId: await this.#nodeId(item.address),
            attributeId: AttributeIds.Value,
            value: { value: encodeVariant(item.value) }
          }))
        );
        const statuses = await session.write(writes);
        statuses.forEach((status, index) => {
          const item = items[index];
          if (!item) return;
          const address = normalizeAddress(item.address);
          results.push(
            status.isGood()
              ? Object.freeze({ ok: true as const, address })
              : Object.freeze({
                  ok: false as const,
                  address,
                  error: this.#error("DATASOURCE_WRITE_ERROR", status.name, "write", address)
                })
          );
        });
      } catch (cause) {
        for (const item of items) {
          const address = normalizeAddress(item.address);
          results.push(
            Object.freeze({
              ok: false,
              address,
              error: this.#normalizeError(cause, "write", address)
            })
          );
        }
      }
    }
    this.#stats.completedWrites += results.filter((result) => result.ok).length;
    return Object.freeze({ results: Object.freeze(results) });
  }

  async subscribe(
    request: Readonly<SubscriptionRequest>,
    listener: DataSourceEventListener
  ): Promise<SubscriptionHandle> {
    const session = this.#connected("subscribe");
    assertOperationAllowed("subscribe", this.capabilities, this.permissions);
    if (request.addresses.length === 0)
      throw new DataSourceError(
        "DATASOURCE_SUBSCRIPTION_ERROR",
        "At least one address is required."
      );
    const id = request.id ?? `opcua-subscription-${this.#nextSubscription++}`;
    if (this.#subscriptions.has(id))
      throw new DataSourceError("DATASOURCE_SUBSCRIPTION_ERROR", "Subscription id already exists.");
    const subscription = ClientSubscription.create(session, {
      requestedPublishingInterval:
        request.publishIntervalMs ?? this.#config.subscription?.publishingIntervalMs ?? 1_000,
      requestedLifetimeCount: 100,
      requestedMaxKeepAliveCount: 10,
      maxNotificationsPerPublish: 1_000,
      publishingEnabled: true,
      priority: 0
    });
    const addresses = request.addresses.map(normalizeAddress);
    const nodeIds = await Promise.all(addresses.map((address) => this.#nodeId(address)));
    const group = ClientMonitoredItemGroup.create(
      subscription,
      nodeIds.map((nodeId) => ({ nodeId, attributeId: AttributeIds.Value })),
      {
        samplingInterval:
          request.samplingIntervalMs ?? this.#config.subscription?.samplingIntervalMs ?? 500,
        discardOldest: request.discardOldest ?? true,
        queueSize: request.queueSize ?? this.#config.subscription?.queueSize ?? 10
      },
      TimestampsToReturn.Both
    );
    group.on("changed", (item, dataValue: DataValue, index: number) => {
      if (this.#disposed) return;
      try {
        const address = addresses[index];
        if (!address) return;
        const value = normalizeDataValue(address, dataValue);
        listener(
          Object.freeze({ type: "VALUE", adapter: this.identity, timestamp: Date.now(), value })
        );
      } catch {
        /* consumer and malformed value isolation */
      }
    });
    const state = { subscription, group, closed: false };
    this.#subscriptions.set(id, state);
    return {
      id,
      get closed() {
        return state.closed;
      },
      unsubscribe: async () => {
        if (state.closed) return;
        state.closed = true;
        this.#subscriptions.delete(id);
        await group.terminate();
        await subscription.terminate();
      }
    };
  }

  async browse(request: Readonly<BrowseRequest>): Promise<Readonly<BrowseResult>> {
    const session = this.#connected("browse");
    if (!request.parent && this.#points.size)
      return Object.freeze({
        points: Object.freeze(
          [...this.#points.values()].map((point) =>
            Object.freeze({
              address: opcUaDataPointAddress(this.identity.id, point.id, point.address),
              ...(point.displayName ? { displayName: point.displayName } : {}),
              ...(point.dataType ? { dataType: point.dataType } : {}),
              readable: true,
              writable: point.writable === true && this.permissions.WRITE
            })
          )
        )
      });
    const parent = request.parent
      ? await this.#nodeId(request.parent)
      : resolveNodeId("ObjectsFolder");
    const response = await session.browse({
      nodeId: parent,
      referenceTypeId: "HierarchicalReferences",
      includeSubtypes: true,
      browseDirection: 0,
      resultMask: 0x3f
    });
    const references = [...(response.references ?? [])]
      .sort((a, b) => a.browseName.toString().localeCompare(b.browseName.toString()))
      .slice(0, request.limit ?? this.#config.limits?.maxBrowseResults ?? 1_000);
    return Object.freeze({
      points: Object.freeze(
        references.map((reference) =>
          Object.freeze({
            address: opcUaDataPointAddress(
              this.identity.id,
              reference.nodeId.toString(),
              reference.nodeId.toString()
            ),
            displayName:
              reference.displayName.text ??
              reference.browseName.name ??
              reference.nodeId.toString(),
            dataType: reference.nodeClass.toString(),
            readable: true,
            metadata: Object.freeze({ browseName: reference.browseName.toString() })
          })
        )
      )
    });
  }

  async callMethod(
    request: Readonly<OpcUaMethodCallRequest>
  ): Promise<Readonly<OpcUaMethodCallResult>> {
    const session = this.#connected("read");
    if (this.#config.methods?.enabled !== true)
      throw new DataSourceError("DATASOURCE_ACCESS_DENIED", "OPC UA method calls are disabled.", {
        recoverable: false
      });
    const result = await session.call({
      objectId: await this.#resolveTextAddress(request.objectId),
      methodId: await this.#resolveTextAddress(request.methodId),
      inputArguments: (request.inputArguments ?? []).map(encodeVariant)
    });
    if (result.statusCode.isBad())
      throw new DataSourceError(
        "DATASOURCE_INTERNAL_ERROR",
        `OPC UA method failed: ${result.statusCode.name}.`,
        { recoverable: false }
      );
    return Object.freeze({
      statusCode: result.statusCode.name,
      outputArguments: Object.freeze((result.outputArguments ?? []).map(decodeVariant))
    });
  }

  getDiagnostics(): Readonly<OpcUaDiagnosticsSnapshot> {
    return Object.freeze({
      endpointUrl: redactEndpoint(this.#config.endpointUrl),
      sessionActive: this.#session !== undefined,
      subscriptionCount: this.#subscriptions.size,
      monitoredItemCount: [...this.#subscriptions.values()].reduce(
        (sum, item) => sum + item.group.monitoredItems.length,
        0
      ),
      reconnectCount: this.#stats.reconnectCount,
      completedReads: this.#stats.completedReads,
      completedWrites: this.#stats.completedWrites,
      ...(this.#stats.lastError ? { lastError: this.#stats.lastError } : {})
    });
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    await this.#lifecycle.dispose();
    await this.#close();
  }

  async #open(signal: AbortSignal): Promise<void> {
    const security = this.#config.security ?? { mode: "None", policy: "None" };
    const client = OPCUAClient.create({
      applicationName: this.#config.identity.displayName ?? this.#config.identity.id,
      securityMode: MessageSecurityMode[security.mode],
      securityPolicy: SecurityPolicy[security.policy],
      endpointMustExist: true,
      requestedSessionTimeout: this.#config.session?.requestedSessionTimeoutMs ?? 60_000,
      keepSessionAlive: this.#config.session?.keepSessionAlive ?? true,
      connectionStrategy: { initialDelay: 250, maxDelay: 5_000, maxRetry: 0 },
      ...(security.certificateFile
        ? { certificateFile: security.certificateFile, privateKeyFile: security.privateKeyFile }
        : {})
    });
    this.#client = client;
    const abort = (): void => {
      void client.disconnect().catch(() => undefined);
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      await client.connect(this.#config.discoveryUrl ?? this.#config.endpointUrl);
      const session = await client.createSession(await this.#identity(signal));
      if (signal.aborted)
        throw new DataSourceError("DATASOURCE_CONNECTION_ERROR", "OPC UA connection cancelled.");
      this.#session = session;
    } catch (cause) {
      this.#stats.lastError = "OPC UA connection failed.";
      await client.disconnect().catch(() => undefined);
      if (this.#client === client) this.#client = undefined;
      throw normalizeCause(cause, "connect");
    } finally {
      signal.removeEventListener("abort", abort);
    }
  }

  async #close(): Promise<void> {
    const subscriptions = [...this.#subscriptions.values()];
    this.#subscriptions.clear();
    for (const state of subscriptions) {
      state.closed = true;
      await state.group.terminate().catch(() => undefined);
      await state.subscription.terminate().catch(() => undefined);
    }
    const session = this.#session;
    this.#session = undefined;
    const client = this.#client;
    this.#client = undefined;
    await session?.close().catch(() => undefined);
    await client?.disconnect().catch(() => undefined);
  }

  async #identity(signal: AbortSignal): Promise<UserIdentityInfo> {
    const identity = this.#config.userIdentity ?? { type: "anonymous" };
    if (identity.type === "anonymous") return { type: UserTokenType.Anonymous };
    const provider = this.#config.secretProvider;
    if (!provider)
      throw new DataSourceError(
        "DATASOURCE_CONFIGURATION_ERROR",
        "Secret provider is unavailable."
      );
    const secrets = await provider(
      identity.type === "username" ? identity.secretRef : identity.certificateRef,
      signal
    );
    if (identity.type === "username") {
      if (!secrets.username || secrets.password === undefined)
        throw new DataSourceError(
          "DATASOURCE_CONFIGURATION_ERROR",
          "Secret provider did not return username credentials.",
          { recoverable: false }
        );
      return {
        type: UserTokenType.UserName,
        userName: secrets.username,
        password: secrets.password
      };
    }
    const keySecrets = await provider(identity.privateKeyRef, signal);
    const certificateFile = secrets.certificateFile;
    const privateKeyFile = keySecrets.privateKeyFile ?? secrets.privateKeyFile;
    if (!certificateFile || !privateKeyFile)
      throw new DataSourceError(
        "DATASOURCE_CONFIGURATION_ERROR",
        "Secret provider did not return certificate paths.",
        { recoverable: false }
      );
    return {
      type: UserTokenType.Certificate,
      certificateData: await readFile(certificateFile),
      privateKey: await readFile(privateKeyFile, "utf8")
    };
  }

  async #nodeId(address: Readonly<DataPointAddress>): Promise<NodeIdLike> {
    const point = this.#points.get(address.key);
    const extension = address.extensions?.opcUaAddress;
    return this.#resolveTextAddress(
      point?.address ?? (typeof extension === "string" ? extension : address.key)
    );
  }
  async #resolveTextAddress(text: string): Promise<NodeIdLike> {
    const parsed = parseOpcUaAddress(text);
    if (parsed.kind === "nodeId") return resolveNodeId(parsed.value);
    const session = this.#session;
    if (!session)
      throw new DataSourceError("DATASOURCE_NOT_CONNECTED", "OPC UA session is unavailable.");
    if (parsed.kind === "browsePath") {
      const path = `/${parsed.segments.map((segment) => segment.replaceAll("/", "&/")).join("/")}`;
      const result = await session.translateBrowsePath(makeBrowsePath("RootFolder", path));
      const targets = result.targets ?? [];
      if (targets.length !== 1)
        throw new DataSourceError(
          "DATASOURCE_READ_ERROR",
          `Browse path resolved to ${targets.length} targets.`
        );
      const target = targets[0];
      if (!target)
        throw new DataSourceError("DATASOURCE_READ_ERROR", "Browse path target is unavailable.");
      return target.targetId;
    }
    const namespaceArray = await session.readNamespaceArray();
    const index = namespaceArray.indexOf(parsed.namespaceUri);
    if (index < 0)
      throw new DataSourceError("DATASOURCE_READ_ERROR", "OPC UA namespace URI is unavailable.");
    return resolveNodeId(`ns=${index};${parsed.identifier}`);
  }
  #connected(operation: "read" | "write" | "browse" | "subscribe"): ClientSession {
    this.#active();
    const session = this.#session;
    if (!session || this.#lifecycle.status.state !== "connected")
      throw new DataSourceError("DATASOURCE_NOT_CONNECTED", "OPC UA adapter is not connected.", {
        operation
      });
    return session;
  }
  #active(): void {
    if (this.#disposed)
      throw new DataSourceError("DATASOURCE_DISPOSED", "OPC UA adapter is disposed.", {
        recoverable: false
      });
  }
  #error(
    code: "DATASOURCE_READ_ERROR" | "DATASOURCE_WRITE_ERROR",
    message: string,
    operation: "read" | "write",
    address: Readonly<DataPointAddress>
  ): SerializedDataSourceError {
    return new DataSourceError(code, message, {
      operation,
      adapterId: this.identity.id,
      address,
      recoverable: false
    }).toJSON();
  }
  #normalizeError(
    cause: unknown,
    operation: "read" | "write",
    address: Readonly<DataPointAddress>
  ): SerializedDataSourceError {
    const error = normalizeCause(cause, operation, address, this.identity.id);
    return error.toJSON();
  }
}

function encodeVariant(value: JsonValue): Variant {
  if (value === null) return new Variant({ dataType: DataType.Null, value: null });
  if (typeof value === "boolean") return new Variant({ dataType: DataType.Boolean, value });
  if (typeof value === "string") return new Variant({ dataType: DataType.String, value });
  if (typeof value === "number")
    return new Variant({
      dataType: Number.isInteger(value) ? DataType.Int32 : DataType.Double,
      value
    });
  if (Array.isArray(value)) {
    if (value.every((item): item is number => typeof item === "number"))
      return new Variant({ dataType: DataType.Double, arrayType: VariantArrayType.Array, value });
    if (value.every((item): item is string => typeof item === "string"))
      return new Variant({ dataType: DataType.String, arrayType: VariantArrayType.Array, value });
    throw new DataSourceError(
      "DATASOURCE_WRITE_ERROR",
      "OPC UA arrays must contain only numbers or only strings."
    );
  }
  throw new DataSourceError(
    "DATASOURCE_WRITE_ERROR",
    "Structured OPC UA writes require an explicit typed codec.",
    { recoverable: false }
  );
}
function normalizeCause(
  cause: unknown,
  operation: "connect" | "read" | "write",
  address?: Readonly<DataPointAddress>,
  adapterId?: string
): DataSourceError {
  if (cause instanceof DataSourceError) return cause;
  const raw = cause instanceof Error ? cause.message : String(cause);
  const denied = /access.?denied|identity.*rejected|user.*invalid/i.test(raw);
  return new DataSourceError(
    denied
      ? "DATASOURCE_ACCESS_DENIED"
      : operation === "connect"
        ? "DATASOURCE_CONNECTION_ERROR"
        : operation === "write"
          ? "DATASOURCE_WRITE_ERROR"
          : "DATASOURCE_READ_ERROR",
    denied ? "OPC UA access was denied." : `OPC UA ${operation} failed.`,
    {
      operation,
      recoverable: operation === "connect",
      ...(adapterId ? { adapterId } : {}),
      ...(address ? { address } : {}),
      cause
    }
  );
}
function redactEndpoint(endpoint: string): string {
  const url = new URL(endpoint);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.toString();
}
