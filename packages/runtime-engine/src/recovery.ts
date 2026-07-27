export type RuntimeRecoveryStrategy =
  "ignore" | "retry" | "fallback" | "disable-symbol" | "escalate";

export interface RuntimeRecoveryPolicy {
  readonly strategy: RuntimeRecoveryStrategy;
  readonly maximumAttempts?: number;
  readonly fallback?: unknown;
}

export type RuntimeRecoveryPolicies = Readonly<Record<string, RuntimeRecoveryPolicy>>;

export const DEFAULT_RUNTIME_RECOVERY_POLICIES: RuntimeRecoveryPolicies = Object.freeze({
  RUNTIME_VALUE_REJECTED: Object.freeze({ strategy: "ignore" }),
  RUNTIME_VISUAL_VALUE_INVALID: Object.freeze({ strategy: "fallback" }),
  RUNTIME_VALUE_STALE: Object.freeze({ strategy: "fallback" }),
  RUNTIME_VISUAL_TARGET_MISSING: Object.freeze({ strategy: "disable-symbol" }),
  RUNTIME_SUBSCRIBER_ERROR: Object.freeze({ strategy: "ignore" }),
  RUNTIME_SCHEDULER_ERROR: Object.freeze({ strategy: "escalate" }),
  SIMULATOR_INTERRUPTED: Object.freeze({ strategy: "retry", maximumAttempts: 1 })
});

export class RuntimeRecoveryPolicyResolver {
  readonly #policies: RuntimeRecoveryPolicies;
  public constructor(policies: RuntimeRecoveryPolicies = {}) {
    this.#policies = Object.freeze({ ...DEFAULT_RUNTIME_RECOVERY_POLICIES, ...policies });
  }
  public resolve(code: string): RuntimeRecoveryPolicy {
    return this.#policies[code] ?? Object.freeze({ strategy: "escalate" });
  }
}
