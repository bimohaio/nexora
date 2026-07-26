import type { ValidationIssue } from "./validation.js";

export class DocumentValidationError extends Error {
  public constructor(public readonly issues: readonly ValidationIssue[]) {
    super("SCADA document validation failed");
    this.name = "DocumentValidationError";
  }
}
