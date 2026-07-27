import { InteractionError } from "./base.js";

export type SchedulerErrorCode =
  "SCHEDULER_DISPOSED" | "SCHEDULER_WORK_INVALID" | "SCHEDULER_BUDGET_INVALID";
export type PerformanceErrorCode = "PERFORMANCE_DISPOSED" | "PERFORMANCE_SAMPLE_INVALID";
export type CacheErrorCode = "CACHE_DISPOSED" | "CACHE_CAPACITY_INVALID";
export type ProfilingErrorCode = "PROFILING_DISPOSED" | "PROFILING_SPAN_INVALID";

export class SchedulerError extends InteractionError {
  public override readonly name = "SchedulerError";
  public constructor(code: SchedulerErrorCode, message: string) {
    super(code, message, "validation");
  }
}
export class PerformanceError extends InteractionError {
  public override readonly name = "PerformanceError";
  public constructor(code: PerformanceErrorCode, message: string) {
    super(code, message, "validation");
  }
}
export class CacheError extends InteractionError {
  public override readonly name = "CacheError";
  public constructor(code: CacheErrorCode, message: string) {
    super(code, message, "validation");
  }
}
export class ProfilingError extends InteractionError {
  public override readonly name = "ProfilingError";
  public constructor(code: ProfilingErrorCode, message: string) {
    super(code, message, "validation");
  }
}
