export type SelectionErrorCode =
  "SELECTION_VALIDATION" | "SELECTION_CANCELLED" | "SELECTION_DISPOSED" | (string & {});

export class SelectionError extends Error {
  public override readonly name = "SelectionError";
  public constructor(
    public readonly code: SelectionErrorCode,
    message: string,
    public readonly recoverable: boolean,
    options?: ErrorOptions
  ) {
    super(message, options);
  }
}
