export type InteractionErrorCode =
  | "INTERACTION_RECOVERABLE"
  | "INTERACTION_FATAL"
  | "INTERACTION_VALIDATION"
  | "INTERACTION_CANCELLED"
  | (string & {});

export class InteractionError extends Error {
  public override readonly name: string = "InteractionError";
  public constructor(
    public readonly code: InteractionErrorCode,
    message: string,
    public readonly category: "recoverable" | "fatal" | "validation" | "cancelled",
    options?: ErrorOptions
  ) {
    super(message, options);
  }
}
