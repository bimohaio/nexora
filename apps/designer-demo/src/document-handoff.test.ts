import { describe, expect, it } from "vitest";
import { serializeDocumentJson } from "@web-scada/core";
import { createIndustrialSymbolEnvironment } from "@web-scada/renderer-svg";
import { WATER_TREATMENT_DOCUMENT } from "../../runtime-demo/src/sample-document.js";
import { DESIGNER_DOCUMENT_FRAGMENT_KEY, resolveDesignerDocument } from "./document-handoff.js";
import { DESIGNER_SAMPLE_DOCUMENT } from "./sample-document.js";

describe("Designer document handoff", () => {
  it("loads and validates the persisted Runtime document", () => {
    const serialized = serializeDocumentJson(WATER_TREATMENT_DOCUMENT);
    expect(serialized.success).toBe(true);
    if (!serialized.success) return;
    const hash = new URLSearchParams({
      [DESIGNER_DOCUMENT_FRAGMENT_KEY]: serialized.json,
      source: "runtime",
      session: "edit-1",
      runtimeOrigin: "http://127.0.0.1:4173",
      baseRevision: "2"
    }).toString();

    const result = resolveDesignerDocument(
      `#${hash}`,
      DESIGNER_SAMPLE_DOCUMENT,
      createIndustrialSymbolEnvironment()
    );

    expect(result.openedFromRuntime).toBe(true);
    expect(result.document).toEqual(WATER_TREATMENT_DOCUMENT);
    expect(result.sessionId).toBe("edit-1");
    expect(result.runtimeOrigin).toBe("http://127.0.0.1:4173");
    expect(result.baseRevision).toBe(2);
  });

  it("uses the normal Designer sample when no handoff exists", () => {
    expect(
      resolveDesignerDocument("", DESIGNER_SAMPLE_DOCUMENT, createIndustrialSymbolEnvironment())
    ).toEqual({
      document: DESIGNER_SAMPLE_DOCUMENT,
      openedFromRuntime: false
    });
  });

  it("rejects malformed or unknown-symbol handoffs", () => {
    expect(() =>
      resolveDesignerDocument(
        `#${new URLSearchParams({
          [DESIGNER_DOCUMENT_FRAGMENT_KEY]: "not-json",
          session: "edit-1",
          runtimeOrigin: "http://127.0.0.1:4173",
          baseRevision: "1"
        }).toString()}`,
        DESIGNER_SAMPLE_DOCUMENT,
        createIndustrialSymbolEnvironment()
      )
    ).toThrow("Unable to open Runtime document");

    const invalid = {
      ...structuredClone(WATER_TREATMENT_DOCUMENT),
      nodes: WATER_TREATMENT_DOCUMENT.nodes.map((node, index) =>
        index === 0 ? { ...node, symbolType: "vendor.unknown" } : node
      )
    };
    const serialized = serializeDocumentJson(invalid);
    expect(serialized.success).toBe(true);
    if (!serialized.success) return;
    expect(() =>
      resolveDesignerDocument(
        `#${new URLSearchParams({
          [DESIGNER_DOCUMENT_FRAGMENT_KEY]: serialized.json,
          session: "edit-1",
          runtimeOrigin: "http://127.0.0.1:4173",
          baseRevision: "1"
        }).toString()}`,
        DESIGNER_SAMPLE_DOCUMENT,
        createIndustrialSymbolEnvironment()
      )
    ).toThrow("Unable to open Runtime document");
  });
});
