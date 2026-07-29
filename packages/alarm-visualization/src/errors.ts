export interface AlarmErrorContext {
  readonly code: string;
  readonly alarmId?: string;
  readonly entityId?: string;
  readonly cause?: unknown;
}
export class AlarmError extends Error {
  public readonly code: string;
  public readonly alarmId: string | undefined;
  public readonly entityId: string | undefined;
  public override readonly cause?: unknown;
  public constructor(message: string, context: AlarmErrorContext) {
    super(message);
    this.name = new.target.name;
    this.code = context.code;
    this.alarmId = context.alarmId;
    this.entityId = context.entityId;
    this.cause = context.cause;
  }
}
export class AlarmValidationError extends AlarmError {}
export class AlarmConditionError extends AlarmError {}
export class AlarmSeverityError extends AlarmError {}
export class AlarmStateTransitionError extends AlarmError {}
export class AlarmAcknowledgmentError extends AlarmError {}
export class AlarmVisualResolutionError extends AlarmError {}
