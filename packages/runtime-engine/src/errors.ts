export type RuntimeErrorCode =
  | "RUNTIME_DISPOSED"
  | "RUNTIME_VALUE_INVALID"
  | "RUNTIME_CONFIGURATION_INVALID"
  | "RUNTIME_REENTRANT_UPDATE";

export class RuntimeEngineError extends Error {
  public constructor(
    public readonly code: RuntimeErrorCode,
    message: string
  ) {
    super(message);
    this.name = "RuntimeEngineError";
  }
}
