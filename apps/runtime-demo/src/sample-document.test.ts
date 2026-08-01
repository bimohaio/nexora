import { describe, expect, it } from "vitest";
import {
  createIndustrialSymbolEnvironment,
  validateDocumentSymbolEnvironment
} from "@web-scada/renderer-svg";
import { CORE_SYMBOL_TYPES } from "@web-scada/symbols";
import { WATER_TREATMENT_DOCUMENT } from "./sample-document.js";

describe("runtime demo symbol document", () => {
  it("uses only canonical symbols from the shared industrial environment", () => {
    const environment = createIndustrialSymbolEnvironment();

    expect(validateDocumentSymbolEnvironment(WATER_TREATMENT_DOCUMENT, environment)).toEqual({
      valid: true,
      diagnostics: []
    });
    expect(
      WATER_TREATMENT_DOCUMENT.nodes
        .filter(({ symbolType }) => symbolType === CORE_SYMBOL_TYPES.text)
        .map(({ id }) => id)
    ).toEqual([
      "node_title",
      "node_flow_readout",
      "node_pressure_readout",
      "node_temperature_readout",
      "node_level_readout"
    ]);
  });
});
