import type {
  RuntimeDisposable,
  RuntimeLifecycleHooks,
  RuntimeLifecycleStatus
} from "./contracts.js";
import { RuntimeEngineError } from "./errors.js";
import type { RuntimeEventBus } from "./events.js";

export interface RuntimeLifecycleManagerOptions {
  readonly hooks?: RuntimeLifecycleHooks;
  readonly events?: RuntimeEventBus;
  readonly now?: () => number;
}

/**
 * Validated async lifecycle state machine and resource owner. Operations are serialized by
 * rejecting overlapping transitions rather than allowing ambiguous intermediate state.
 */
export class RuntimeLifecycleManager {
  readonly #hooks: RuntimeLifecycleHooks;
  readonly #events: RuntimeEventBus | undefined;
  readonly #now: () => number;
  readonly #resources: RuntimeDisposable[] = [];
  #status: RuntimeLifecycleStatus = "idle";
  #initialized = false;
  #transitioning = false;

  public constructor(options: RuntimeLifecycleManagerOptions = {}) {
    this.#hooks = options.hooks ?? {};
    this.#events = options.events;
    this.#now = options.now ?? (() => Date.now());
  }

  public get status(): RuntimeLifecycleStatus {
    return this.#status;
  }

  public get initialized(): boolean {
    return this.#initialized;
  }

  public get disposed(): boolean {
    return this.#status === "disposed";
  }

  public get resourceCount(): number {
    return this.#resources.length;
  }

  public register(resource: RuntimeDisposable): () => void {
    this.#assertNotDisposed();
    if (this.#resources.includes(resource)) return () => undefined;
    this.#resources.push(resource);
    let registered = true;
    return () => {
      if (!registered) return;
      registered = false;
      const index = this.#resources.indexOf(resource);
      if (index >= 0) this.#resources.splice(index, 1);
    };
  }

  public async initialize(): Promise<void> {
    this.#assertNotDisposed();
    if (this.#initialized) return;
    await this.#runTransition(async () => {
      await this.#hooks.initialize?.();
      this.#initialized = true;
    });
  }

  public async start(): Promise<void> {
    this.#assertStatus(["idle", "stopped"], "start");
    if (!this.#initialized) await this.initialize();
    await this.#runTransition(async () => {
      this.#status = "starting";
      try {
        await this.#hooks.start?.();
        this.#status = "running";
        this.#events?.emit("RuntimeStarted", { timestamp: this.#now() });
      } catch (error) {
        this.#status = "stopped";
        throw error;
      }
    });
  }

  public async pause(): Promise<void> {
    this.#assertStatus(["running"], "pause");
    await this.#runTransition(async () => {
      await this.#hooks.pause?.();
      this.#status = "paused";
      this.#events?.emit("RuntimePaused", { timestamp: this.#now() });
    });
  }

  public async resume(): Promise<void> {
    this.#assertStatus(["paused"], "resume");
    await this.#runTransition(async () => {
      await this.#hooks.resume?.();
      this.#status = "running";
      this.#events?.emit("RuntimeResumed", { timestamp: this.#now() });
    });
  }

  public async stop(): Promise<void> {
    if (this.#status === "stopped") return;
    this.#assertStatus(["running", "paused"], "stop");
    await this.#runTransition(async () => {
      this.#status = "stopping";
      try {
        await this.#hooks.stop?.();
      } finally {
        this.#status = "stopped";
        this.#events?.emit("RuntimeStopped", { timestamp: this.#now() });
      }
    });
  }

  public async dispose(): Promise<void> {
    if (this.#status === "disposed") return;
    if (this.#transitioning)
      throw new RuntimeEngineError(
        "RUNTIME_LIFECYCLE_INVALID",
        "Cannot dispose during another lifecycle transition."
      );
    if (this.#status === "running" || this.#status === "paused") await this.stop();
    await this.#runTransition(async () => {
      let firstError: unknown;
      for (const resource of this.#resources.splice(0).reverse())
        try {
          await resource.dispose();
        } catch (error) {
          firstError ??= error;
        }
      try {
        await this.#hooks.dispose?.();
      } catch (error) {
        firstError ??= error;
      }
      this.#status = "disposed";
      this.#events?.emit("RuntimeDisposed", { timestamp: this.#now() });
      if (firstError !== undefined)
        throw firstError instanceof Error
          ? firstError
          : new Error("Runtime resource disposal failed.", { cause: firstError });
    });
  }

  async #runTransition(operation: () => Promise<void>): Promise<void> {
    if (this.#transitioning)
      throw new RuntimeEngineError(
        "RUNTIME_LIFECYCLE_INVALID",
        "A runtime lifecycle transition is already in progress."
      );
    this.#transitioning = true;
    try {
      await operation();
    } finally {
      this.#transitioning = false;
    }
  }

  #assertNotDisposed(): void {
    if (this.#status === "disposed")
      throw new RuntimeEngineError("RUNTIME_DISPOSED", "Runtime lifecycle is disposed.");
  }

  #assertStatus(allowed: readonly RuntimeLifecycleStatus[], operation: string): void {
    this.#assertNotDisposed();
    if (!allowed.includes(this.#status))
      throw new RuntimeEngineError(
        "RUNTIME_LIFECYCLE_INVALID",
        `Cannot ${operation} runtime while status is ${this.#status}.`
      );
  }
}
