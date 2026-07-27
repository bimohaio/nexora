export type InteractionSessionStatus = "idle" | "active" | "committed" | "canceled" | "disposed";

export abstract class InteractionSession<TUpdate = unknown, TResult = unknown> {
  #status: InteractionSessionStatus = "idle";
  public constructor(
    public readonly id: string,
    public readonly kind: string
  ) {}
  public get status(): InteractionSessionStatus {
    return this.#status;
  }
  public start(): void {
    if (this.#status !== "idle") throw new Error(`Cannot start ${this.#status} session.`);
    this.onStart();
    this.#status = "active";
  }
  public update(input: Readonly<TUpdate>): void {
    this.#assertActive("update");
    this.onUpdate(input);
  }
  public commit(): TResult {
    this.#assertActive("commit");
    const result = this.onCommit();
    this.#status = "committed";
    return result;
  }
  public cancel(reason?: string): void {
    if (this.#status !== "active") return;
    this.onCancel(reason);
    this.#status = "canceled";
  }
  public dispose(): void {
    if (this.#status === "disposed") return;
    if (this.#status === "active") this.cancel("disposed");
    this.onDispose();
    this.#status = "disposed";
  }
  protected abstract onStart(): void;
  protected abstract onUpdate(input: Readonly<TUpdate>): void;
  protected abstract onCommit(): TResult;
  protected abstract onCancel(reason?: string): void;
  protected abstract onDispose(): void;
  #assertActive(action: string): void {
    if (this.#status !== "active") throw new Error(`Cannot ${action} ${this.#status} session.`);
  }
}

export class InteractionSessionManager {
  #active: InteractionSession | undefined;
  public get active(): InteractionSession | undefined {
    return this.#active;
  }
  public start(session: InteractionSession): void {
    if (this.#active !== undefined) this.cancelCurrent("replaced");
    session.start();
    this.#active = session;
  }
  public commitCurrent(): unknown {
    const session = this.#active;
    if (session === undefined) return undefined;
    try {
      return session.commit();
    } finally {
      session.dispose();
      this.#active = undefined;
    }
  }
  public cancelCurrent(reason?: string): void {
    const session = this.#active;
    if (session === undefined) return;
    try {
      session.cancel(reason);
    } finally {
      session.dispose();
      this.#active = undefined;
    }
  }
  public dispose(): void {
    this.cancelCurrent("manager-disposed");
  }
}
