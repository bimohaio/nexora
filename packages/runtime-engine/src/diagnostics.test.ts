import { describe, expect, it } from "vitest";
import {
  MemoryRuntimeLogger,
  RuntimeDiagnosticsService,
  RuntimeEngineError,
  RuntimeMetrics,
  RuntimeRecoveryPolicyResolver,
  type RuntimeDiagnostic
} from "./index.js";

const warning = (timestamp = "2025-01-01T00:00:00.000Z"): RuntimeDiagnostic =>
  Object.freeze({
    code: "RUNTIME_VALUE_REJECTED" as const,
    severity: "warning" as const,
    message: "Value rejected.",
    recoverable: true,
    timestamp,
    context: Object.freeze({ tagId: "tag-1", authenticationToken: "private" })
  });

describe("runtime diagnostics framework", () => {
  it("creates immutable typed errors", () => {
    const error = new RuntimeEngineError("BROKEN", "Broken", {
      category: "RESOLVER_ERROR",
      recoverable: true,
      context: { symbolId: "pump-1" }
    });
    expect(Object.isFrozen(error)).toBe(true);
    expect(error.category).toBe("RESOLVER_ERROR");
    expect(error.recoverable).toBe(true);
  });

  it("aggregates, suppresses, sanitizes, clears, and reports recovery", () => {
    const logger = new MemoryRuntimeLogger();
    const diagnostics = new RuntimeDiagnosticsService({
      logger,
      suppressionThreshold: 1
    });
    diagnostics.report(warning());
    diagnostics.report(warning("2025-01-01T00:00:01.000Z"));
    const [issue] = diagnostics.getDiagnostics();
    expect(issue?.occurrenceCount).toBe(2);
    expect(issue?.suppressed).toBe(true);
    expect(issue?.context.authenticationToken).toBe("[REDACTED]");
    expect(logger.getEntries()).toHaveLength(1);
    expect(diagnostics.getHealth()).toBe("Warning");
    diagnostics.clear();
    expect(diagnostics.getHealth()).toBe("Recovered");
  });

  it("resolves deterministic policies and exposes lightweight metrics", () => {
    expect(new RuntimeRecoveryPolicyResolver().resolve("RUNTIME_VALUE_REJECTED").strategy).toBe(
      "ignore"
    );
    const metrics = new RuntimeMetrics();
    metrics.recordUpdate();
    metrics.recordUpdate(true);
    metrics.recordResolveDuration(4);
    metrics.recordResolveDuration(2);
    expect(metrics.snapshot(3)).toMatchObject({
      totalUpdates: 2,
      failedUpdates: 1,
      activeSubscriptions: 3,
      averageResolveTimeMs: 3
    });
  });
});
