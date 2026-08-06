import type {
  ConnectionFlowAlarmState,
  ConnectionFlowQuality,
  ConnectionFlowRuntimeUpdate
} from "@web-scada/runtime-engine";

export const CONNECTION_FLOW_BINDING_PARAMETERS = [
  "enabled",
  "speed",
  "direction",
  "quality",
  "alarm",
  "flowPercentage"
] as const;
export type ConnectionFlowBindingParameter = (typeof CONNECTION_FLOW_BINDING_PARAMETERS)[number];

export interface ConnectionFlowBindingOutput {
  readonly connectionId: string;
  readonly target: string;
  readonly value: unknown;
}

export interface ConnectionFlowBindingResult {
  readonly update?: Readonly<ConnectionFlowRuntimeUpdate>;
  readonly diagnostic?: Readonly<{
    code: "CONNECTION_FLOW_BINDING_TARGET_INVALID" | "CONNECTION_FLOW_BINDING_VALUE_INVALID";
    message: string;
  }>;
}

/** Converts resolved binding output only; this adapter never reads a data source. */
export function toConnectionFlowRuntimeUpdate(
  output: Readonly<ConnectionFlowBindingOutput>
): ConnectionFlowBindingResult {
  const segments = output.target.split(".");
  const candidate = segments.length === 2 && segments[0] === "flow" ? segments[1] : output.target;
  const parameter = CONNECTION_FLOW_BINDING_PARAMETERS.find((entry) => entry === candidate);
  if (parameter === undefined)
    return {
      diagnostic: {
        code: "CONNECTION_FLOW_BINDING_TARGET_INVALID",
        message: `Connection flow binding target '${output.target}' is invalid.`
      }
    };
  if (!valid(parameter, output.value))
    return {
      diagnostic: {
        code: "CONNECTION_FLOW_BINDING_VALUE_INVALID",
        message: `Connection flow binding value for '${parameter}' is invalid.`
      }
    };
  if (parameter === "enabled") return { update: { enabled: output.value as boolean } };
  if (parameter === "speed") return { update: { speed: output.value as number } };
  if (parameter === "flowPercentage") return { update: { flowPercentage: output.value as number } };
  if (parameter === "direction")
    return { update: { direction: output.value as "forward" | "reverse" } };
  if (parameter === "quality")
    return { update: { quality: output.value as ConnectionFlowQuality } };
  return { update: { alarm: output.value as ConnectionFlowAlarmState } };
}

function valid(parameter: ConnectionFlowBindingParameter, value: unknown): boolean {
  if (parameter === "enabled") return typeof value === "boolean";
  if (parameter === "speed")
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
  if (parameter === "flowPercentage")
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
  if (parameter === "direction") return value === "forward" || value === "reverse";
  if (parameter === "quality")
    return ["good", "uncertain", "bad", "stale", "offline"].includes(value as string);
  return ["none", "critical", "warning", "acknowledged", "shelved"].includes(value as string);
}
