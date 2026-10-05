import type { HistoryDiagnostic, HistoryErrorCode } from "./contracts.js";

export class HistoryError extends Error {
  public override readonly name = "HistoryError";
  public readonly diagnostic: HistoryDiagnostic;

  public constructor(code: HistoryErrorCode, message: string, recoverable = true, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.diagnostic = Object.freeze({ code, message, severity: "error", recoverable });
  }

  public get code(): HistoryErrorCode {
    return this.diagnostic.code;
  }
}
