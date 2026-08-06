/* eslint-disable @typescript-eslint/no-deprecated -- legacy registry compatibility coverage */
import { describe, expect, it } from "vitest";
import { validateDocumentSemantics } from "@web-scada/core";
import { createExampleSymbolRegistry } from "@web-scada/symbols";
import { WATER_TREATMENT_DOCUMENT } from "../../apps/runtime-demo/src/sample-document.js";

describe("Phase 2 runtime sample", () => {
  it("is a valid symbol-aware SCADA document", () => {
    const result = validateDocumentSemantics(WATER_TREATMENT_DOCUMENT, {
      symbolRegistry: createExampleSymbolRegistry()
    });
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
  });
});
/* Legacy registry is intentional compatibility coverage. */
