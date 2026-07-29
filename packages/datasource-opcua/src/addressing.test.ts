import { describe, expect, it } from "vitest";
import { parseOpcUaAddress } from "./addressing.js";

describe("OPC UA addressing", () => {
  it("preserves supported NodeId identifier types", () => {
    expect(parseOpcUaAddress("ns=2;s=Motor.Speed")).toEqual({
      kind: "nodeId",
      value: "ns=2;s=Motor.Speed"
    });
    expect(parseOpcUaAddress("ns=3;i=1024")).toEqual({
      kind: "nodeId",
      value: "ns=3;i=1024"
    });
    expect(parseOpcUaAddress("nsu=urn%3Aplant;s=Temperature")).toEqual({
      kind: "expandedNodeId",
      namespaceUri: "urn:plant",
      identifier: "s=Temperature"
    });
    expect(parseOpcUaAddress("/Objects/Plant/Temperature")).toEqual({
      kind: "browsePath",
      segments: ["Objects", "Plant", "Temperature"]
    });
  });

  it.each(["", "ns=x;s=A", "ns=2;i=x", "nsu=broken", "/"])(
    "rejects malformed address %s",
    (address) => {
      expect(() => parseOpcUaAddress(address)).toThrow();
    }
  );
});
