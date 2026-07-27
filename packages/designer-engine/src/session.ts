export type InteractionSessionStatus = "active" | "committed" | "canceled" | "disposed";

export interface InteractionSession<TInput, TPreview, TResult> {
  readonly id: string;
  readonly kind: string;
  readonly status: InteractionSessionStatus;
  update(input: Readonly<TInput>): TPreview;
  commit(): TResult;
  cancel(reason?: string): void;
  dispose(): void;
}

export interface CreateInteractionSessionOptions<TInput, TPreview, TResult> {
  readonly id: string;
  readonly kind: string;
  readonly update: (input: Readonly<TInput>) => TPreview;
  readonly commit: () => TResult;
  readonly cancel?: (reason?: string) => void;
  readonly dispose?: () => void;
}

export class DesignerInteractionSession<TInput, TPreview, TResult> implements InteractionSession<
  TInput,
  TPreview,
  TResult
> {
  #status: InteractionSessionStatus = "active";
  #cleaned = false;

  public constructor(
    private readonly options: CreateInteractionSessionOptions<TInput, TPreview, TResult>
  ) {}

  public get id(): string {
    return this.options.id;
  }

  public get kind(): string {
    return this.options.kind;
  }

  public get status(): InteractionSessionStatus {
    return this.#status;
  }

  public update(input: Readonly<TInput>): TPreview {
    if (this.#status !== "active") throw new Error(`Cannot update ${this.#status} interaction.`);
    return this.options.update(input);
  }

  public commit(): TResult {
    if (this.#status !== "active") throw new Error(`Cannot commit ${this.#status} interaction.`);
    const result = this.options.commit();
    this.#status = "committed";
    this.#cleanup();
    return result;
  }

  public cancel(reason?: string): void {
    if (this.#status !== "active") return;
    this.options.cancel?.(reason);
    this.#status = "canceled";
    this.#cleanup();
  }

  public dispose(): void {
    if (this.#status === "disposed") return;
    if (this.#status === "active") this.options.cancel?.("disposed");
    this.#cleanup();
    this.#status = "disposed";
  }

  #cleanup(): void {
    if (this.#cleaned) return;
    this.#cleaned = true;
    this.options.dispose?.();
  }
}
