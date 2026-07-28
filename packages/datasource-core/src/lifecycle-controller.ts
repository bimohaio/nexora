import type {
  DataSourceConnectionState,
  DataSourceErrorCode,
  SerializedDataSourceError
} from "./contracts.js";
import { DataSourceError } from "./errors.js";
import { assertConnectionTransition } from "./lifecycle.js";
import { createExponentialReconnectPolicy, type ReconnectPolicy } from "./reconnect.js";
import {
  assertDelay,
  SystemDataSourceScheduler,
  type DataSourceScheduledTask,
  type DataSourceScheduler
} from "./scheduling.js";

export interface DataSourceLifecycleStatus {
  readonly state: DataSourceConnectionState;
  readonly revision: number;
  readonly changedAt: number;
  readonly generation: number;
  readonly attempt: number;
  readonly reconnectAttempt: number;
  readonly nextReconnectAt?: number;
  readonly connectedAt?: number;
  readonly disconnectedAt?: number;
  readonly lastError?: Readonly<SerializedDataSourceError>;
}

export interface ConnectionAttemptContext {
  readonly generation: number;
  readonly attempt: number;
  readonly reconnect: boolean;
  readonly signal: AbortSignal;
}

export interface DisconnectionContext {
  readonly generation: number;
  readonly signal: AbortSignal;
}

export interface DataSourceLifecycleOperations {
  connect(context: Readonly<ConnectionAttemptContext>): Promise<void>;
  disconnect(context: Readonly<DisconnectionContext>): Promise<void>;
}

export interface LifecycleDiagnostic {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly timestamp: number;
  readonly adapterId: string;
  readonly generation: number;
  readonly attempt?: number;
}

export interface DataSourceLifecycleControllerOptions {
  readonly adapterId: string;
  readonly operations: DataSourceLifecycleOperations;
  readonly scheduler?: DataSourceScheduler;
  readonly reconnectPolicy?: ReconnectPolicy;
  readonly connectTimeoutMs?: number;
  readonly disconnectTimeoutMs?: number;
  readonly onDiagnostic?: (diagnostic: Readonly<LifecycleDiagnostic>) => void;
}

export interface StatusSubscription {
  readonly closed: boolean;
  unsubscribe(): void;
}

export interface DataSourceLifecycleController {
  readonly status: Readonly<DataSourceLifecycleStatus>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  reconnect(): Promise<void>;
  connectionLost(error?: unknown, generation?: number): void;
  subscribeStatus(
    listener: (status: Readonly<DataSourceLifecycleStatus>) => void,
    emitCurrent?: boolean
  ): StatusSubscription;
  dispose(): Promise<void>;
}

export function createDataSourceLifecycleController(
  options: Readonly<DataSourceLifecycleControllerOptions>
): DataSourceLifecycleController {
  return new LifecycleController(options);
}

class LifecycleController implements DataSourceLifecycleController {
  readonly #adapterId: string;
  readonly #operations: DataSourceLifecycleOperations;
  readonly #scheduler: DataSourceScheduler;
  readonly #policy: ReconnectPolicy;
  readonly #connectTimeoutMs: number | undefined;
  readonly #disconnectTimeoutMs: number | undefined;
  readonly #onDiagnostic: DataSourceLifecycleControllerOptions["onDiagnostic"];
  readonly #listeners = new Set<(status: Readonly<DataSourceLifecycleStatus>) => void>();
  #status: Readonly<DataSourceLifecycleStatus>;
  #generation = 0;
  #attempt = 0;
  #reconnectAttempt = 0;
  #connectPromise: Promise<void> | undefined;
  #disconnectPromise: Promise<void> | undefined;
  #abort: AbortController | undefined;
  #reconnectTask: DataSourceScheduledTask | undefined;
  #disposePromise: Promise<void> | undefined;

  public constructor(options: Readonly<DataSourceLifecycleControllerOptions>) {
    if (options.adapterId.trim() === "")
      throw new DataSourceError("DATASOURCE_CONFIGURATION_ERROR", "adapterId must be non-empty.");
    if (options.connectTimeoutMs !== undefined)
      assertDelay(options.connectTimeoutMs, "connectTimeoutMs");
    if (options.disconnectTimeoutMs !== undefined)
      assertDelay(options.disconnectTimeoutMs, "disconnectTimeoutMs");
    this.#adapterId = options.adapterId;
    this.#operations = options.operations;
    this.#scheduler = options.scheduler ?? new SystemDataSourceScheduler();
    this.#policy = options.reconnectPolicy ?? createExponentialReconnectPolicy();
    this.#connectTimeoutMs = options.connectTimeoutMs;
    this.#disconnectTimeoutMs = options.disconnectTimeoutMs;
    this.#onDiagnostic = options.onDiagnostic;
    this.#status = Object.freeze({
      state: "idle",
      revision: 0,
      changedAt: this.#scheduler.now(),
      generation: 0,
      attempt: 0,
      reconnectAttempt: 0
    });
  }

  public get status(): Readonly<DataSourceLifecycleStatus> {
    return this.#status;
  }

  public connect(): Promise<void> {
    this.#assertActive();
    if (this.#status.state === "connected") return Promise.resolve();
    if (this.#connectPromise) return this.#connectPromise;
    if (this.#disconnectPromise) return this.#disconnectPromise.then(() => this.connect());
    this.#cancelReconnect();
    this.#reconnectAttempt = 0;
    return this.#startConnect(false);
  }

  public disconnect(): Promise<void> {
    this.#assertActive();
    if (this.#disconnectPromise) return this.#disconnectPromise;
    if (this.#status.state === "idle" || this.#status.state === "disconnected") {
      if (this.#status.state === "idle") this.#transition("disconnected");
      return Promise.resolve();
    }
    this.#cancelReconnect();
    const generation = ++this.#generation;
    this.#abort?.abort();
    const abort = new AbortController();
    this.#abort = abort;
    if (this.#status.state !== "disconnecting") this.#transition("disconnecting");
    const work = this.#withTimeout(
      this.#operations.disconnect({ generation, signal: abort.signal }),
      this.#disconnectTimeoutMs,
      "DATASOURCE_DISCONNECTION_ERROR",
      "Disconnect timed out.",
      abort
    )
      .then(() => {
        if (generation === this.#generation && this.#status.state !== "disposed")
          this.#transition("disconnected");
      })
      .catch((cause: unknown) => {
        if (generation !== this.#generation || this.#status.state === "disposed") return;
        const error = this.#normalize(
          cause,
          "DATASOURCE_DISCONNECTION_ERROR",
          "Disconnect failed."
        );
        this.#transition("failed", error);
        throw error;
      })
      .finally(() => {
        if (this.#disconnectPromise === work) this.#disconnectPromise = undefined;
        if (this.#abort === abort) this.#abort = undefined;
      });
    this.#disconnectPromise = work;
    return work;
  }

  public async reconnect(): Promise<void> {
    this.#assertActive();
    this.#cancelReconnect();
    this.#reconnectAttempt = 0;
    if (this.#status.state === "connected" || this.#status.state === "connecting") {
      await this.disconnect();
    }
    await this.#startConnect(false);
  }

  public connectionLost(cause?: unknown, generation = this.#generation): void {
    if (this.#status.state === "disposed" || generation !== this.#generation) return;
    if (!["connected", "connecting", "reconnecting"].includes(this.#status.state)) return;
    this.#abort?.abort();
    const error = this.#normalize(cause, "DATASOURCE_CONNECTION_ERROR", "The connection was lost.");
    this.#transition("failed", error);
    this.#scheduleReconnect(error);
  }

  public subscribeStatus(
    listener: (status: Readonly<DataSourceLifecycleStatus>) => void,
    emitCurrent = true
  ): StatusSubscription {
    this.#assertActive();
    this.#listeners.add(listener);
    let closed = false;
    const handle = {
      get closed(): boolean {
        return closed;
      },
      unsubscribe: (): void => {
        if (closed) return;
        closed = true;
        this.#listeners.delete(listener);
      }
    };
    if (emitCurrent) this.#callListener(listener);
    return handle;
  }

  public dispose(): Promise<void> {
    if (this.#disposePromise) return this.#disposePromise;
    const work = (async (): Promise<void> => {
      if (this.#status.state === "disposed") return;
      this.#cancelReconnect();
      ++this.#generation;
      this.#abort?.abort();
      try {
        await this.#operations.disconnect({
          generation: this.#generation,
          signal: new AbortController().signal
        });
      } catch (cause) {
        this.#diagnostic("DATASOURCE_DISPOSE_CLEANUP_FAILED", "warning", "Dispose cleanup failed.");
        void cause;
      }
      this.#transition("disposed");
      this.#listeners.clear();
    })();
    this.#disposePromise = work;
    return work;
  }

  #startConnect(reconnect: boolean): Promise<void> {
    const generation = ++this.#generation;
    const attempt = ++this.#attempt;
    const abort = new AbortController();
    this.#abort?.abort();
    this.#abort = abort;
    this.#transition(reconnect ? "reconnecting" : "connecting");
    const work = this.#withTimeout(
      this.#operations.connect({ generation, attempt, reconnect, signal: abort.signal }),
      this.#connectTimeoutMs,
      "DATASOURCE_TIMEOUT",
      "Connect timed out.",
      abort
    )
      .then(async () => {
        if (generation !== this.#generation || this.#status.state === "disposed") {
          await this.#cleanupStale(generation);
          return;
        }
        this.#reconnectAttempt = 0;
        this.#transition("connected");
      })
      .catch((cause: unknown) => {
        if (generation !== this.#generation || this.#status.state === "disposed") return;
        const error = this.#normalize(cause, "DATASOURCE_CONNECTION_ERROR", "Connection failed.");
        this.#transition("failed", error);
        if (reconnect) this.#scheduleReconnect(error);
        else if (this.#policy.enabled) this.#scheduleReconnect(error);
        throw error;
      })
      .finally(() => {
        if (this.#connectPromise === work) this.#connectPromise = undefined;
        if (this.#abort === abort) this.#abort = undefined;
      });
    this.#connectPromise = work;
    return work;
  }

  #scheduleReconnect(error: DataSourceError): void {
    if (this.#reconnectTask || this.#status.state === "disposed") return;
    const attempt = this.#reconnectAttempt + 1;
    const context = Object.freeze({ attempt, error: error.toJSON() });
    let allowed = false;
    let delay = 0;
    try {
      allowed = this.#policy.shouldReconnect(context);
      if (allowed) delay = this.#policy.getDelay(context);
      assertDelay(delay);
    } catch {
      this.#diagnostic("DATASOURCE_RECONNECT_POLICY_ERROR", "error", "Reconnect policy failed.");
      return;
    }
    if (!allowed) {
      this.#diagnostic("DATASOURCE_RECONNECT_EXHAUSTED", "warning", "Reconnect is exhausted.");
      return;
    }
    this.#reconnectAttempt = attempt;
    const generation = this.#generation;
    const nextReconnectAt = this.#scheduler.now() + delay;
    this.#publish({ nextReconnectAt, reconnectAttempt: attempt });
    this.#reconnectTask = this.#scheduler.schedule(delay, () => {
      this.#reconnectTask = undefined;
      if (generation !== this.#generation || this.#status.state === "disposed") return;
      void this.#startConnect(true).catch(() => undefined);
    });
    this.#diagnostic("DATASOURCE_RECONNECT_SCHEDULED", "info", "Reconnect scheduled.");
  }

  #cancelReconnect(): void {
    this.#reconnectTask?.cancel();
    this.#reconnectTask = undefined;
  }

  async #cleanupStale(generation: number): Promise<void> {
    try {
      await this.#operations.disconnect({
        generation,
        signal: new AbortController().signal
      });
    } catch {
      this.#diagnostic("DATASOURCE_STALE_CLEANUP_FAILED", "warning", "Stale cleanup failed.");
    }
  }

  #withTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number | undefined,
    code: DataSourceErrorCode,
    message: string,
    abort: AbortController
  ): Promise<T> {
    if (timeoutMs === undefined) return operation;
    return new Promise<T>((resolve, reject) => {
      const timeout = this.#scheduler.schedule(timeoutMs, () => {
        abort.abort();
        reject(
          new DataSourceError(code, message, {
            adapterId: this.#adapterId,
            operation: code === "DATASOURCE_DISCONNECTION_ERROR" ? "disconnect" : "connect",
            recoverable: true,
            timestamp: this.#scheduler.now()
          })
        );
      });
      operation.then(resolve, reject).finally(() => {
        timeout.cancel();
      });
    });
  }

  #transition(state: DataSourceConnectionState, error?: DataSourceError): void {
    assertConnectionTransition(this.#status.state, state);
    const now = this.#scheduler.now();
    this.#status = Object.freeze({
      state,
      revision: this.#status.revision + 1,
      changedAt: now,
      generation: this.#generation,
      attempt: this.#attempt,
      reconnectAttempt: this.#reconnectAttempt,
      ...(state === "connected" ? { connectedAt: now } : {}),
      ...(state === "disconnected" ? { disconnectedAt: now } : {}),
      ...(error === undefined ? {} : { lastError: Object.freeze(error.toJSON()) })
    });
    this.#notify();
  }

  #publish(patch: Partial<DataSourceLifecycleStatus>): void {
    this.#status = Object.freeze({
      ...this.#status,
      ...patch,
      revision: this.#status.revision + 1
    });
    this.#notify();
  }

  #notify(): void {
    for (const listener of [...this.#listeners]) this.#callListener(listener);
  }

  #callListener(listener: (status: Readonly<DataSourceLifecycleStatus>) => void): void {
    try {
      listener(this.#status);
    } catch {
      this.#diagnostic("DATASOURCE_LISTENER_ERROR", "warning", "A lifecycle listener failed.");
    }
  }

  #diagnostic(code: string, severity: LifecycleDiagnostic["severity"], message: string): void {
    try {
      this.#onDiagnostic?.(
        Object.freeze({
          code,
          severity,
          message,
          timestamp: this.#scheduler.now(),
          adapterId: this.#adapterId,
          generation: this.#generation,
          attempt: this.#attempt
        })
      );
    } catch {
      // Diagnostics must never affect lifecycle authority.
    }
  }

  #normalize(cause: unknown, code: DataSourceErrorCode, message: string): DataSourceError {
    if (cause instanceof DataSourceError) return cause;
    return new DataSourceError(code, message, {
      adapterId: this.#adapterId,
      operation: code === "DATASOURCE_DISCONNECTION_ERROR" ? "disconnect" : "connect",
      recoverable: true,
      timestamp: this.#scheduler.now(),
      cause
    });
  }

  #assertActive(): void {
    if (this.#status.state === "disposed") {
      throw new DataSourceError("DATASOURCE_DISPOSED", "Lifecycle is disposed.", {
        adapterId: this.#adapterId,
        timestamp: this.#scheduler.now()
      });
    }
  }
}
