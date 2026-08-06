import { describe, expect, it } from "vitest";
import { toConnectionFlowRuntimeUpdate } from "./connection-flow-bindings.js";

describe("connection flow binding adapter", () => {
  it("maps every supported renderer-neutral runtime parameter", () => {
    expect(
      toConnectionFlowRuntimeUpdate({ connectionId: "c1", target: "flow.speed", value: 2 }).update
    ).toEqual({ speed: 2 });
    expect(
      toConnectionFlowRuntimeUpdate({ connectionId: "c1", target: "direction", value: "reverse" })
        .update
    ).toEqual({ direction: "reverse" });
    expect(
      toConnectionFlowRuntimeUpdate({ connectionId: "c1", target: "quality", value: "offline" })
        .update
    ).toEqual({ quality: "offline" });
    expect(
      toConnectionFlowRuntimeUpdate({ connectionId: "c1", target: "alarm", value: "acknowledged" })
        .update
    ).toEqual({ alarm: "acknowledged" });
    expect(
      toConnectionFlowRuntimeUpdate({ connectionId: "c1", target: "flowPercentage", value: 75 })
        .update
    ).toEqual({ flowPercentage: 75 });
  });
  it("rejects invalid targets and values without throwing", () => {
    expect(
      toConnectionFlowRuntimeUpdate({ connectionId: "c1", target: "flow.speed", value: -1 })
        .diagnostic?.code
    ).toBe("CONNECTION_FLOW_BINDING_VALUE_INVALID");
    expect(
      toConnectionFlowRuntimeUpdate({ connectionId: "c1", target: "flow.secret", value: true })
        .diagnostic?.code
    ).toBe("CONNECTION_FLOW_BINDING_TARGET_INVALID");
  });
});
