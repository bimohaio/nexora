import { describe, expect, it } from "vitest";
import {
  createDefaultSymbolEnvironment,
  createIndustrialSymbolEnvironment,
  validateDocumentSymbolEnvironment
} from "./symbol-environment.js";
import type { ScadaDocument } from "@web-scada/core";

describe("industrial symbol environment", () => {
  it("provides a complete and internally consistent production catalog", () => {
    const environment = createIndustrialSymbolEnvironment();
    const definitions = environment.symbolRegistry.list();
    const categoryIds = new Set(environment.categoryRegistry.list().map(({ id }) => id));

    expect(environment.symbolRegistry.validate()).toEqual({ valid: true, diagnostics: [] });
    expect(environment.categoryRegistry.validate()).toEqual([]);
    expect(environment.svgVisualRegistry.validateAgainst(environment.symbolRegistry)).toEqual({
      valid: true,
      missingVisuals: [],
      orphanVisuals: []
    });
    expect(definitions).toHaveLength(428);
    expect(
      definitions.filter(({ category }) => !categoryIds.has(category)).map(({ type }) => type)
    ).toEqual([]);
  });

  it("uses the same visual implementations in designer and runtime environments", () => {
    const designerEnvironment = createIndustrialSymbolEnvironment();
    const runtimeEnvironment = createIndustrialSymbolEnvironment();

    for (const definition of designerEnvironment.symbolRegistry.list()) {
      expect(runtimeEnvironment.symbolRegistry.require(definition.type)).toEqual(definition);
      expect(runtimeEnvironment.svgVisualRegistry.get(definition.type)).toStrictEqual(
        designerEnvironment.svgVisualRegistry.get(definition.type)
      );
    }
  });

  it("keeps the legacy composition root compatible", () => {
    const current = createIndustrialSymbolEnvironment();
    // Compatibility behavior is the subject of this assertion.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const legacy = createDefaultSymbolEnvironment();

    expect(legacy.symbolRegistry.list()).toEqual(current.symbolRegistry.list());
    expect(legacy.categoryRegistry.list()).toEqual(current.categoryRegistry.list());
    expect(legacy.svgVisualRegistry.validateAgainst(legacy.symbolRegistry)).toEqual({
      valid: true,
      missingVisuals: [],
      orphanVisuals: []
    });
  });

  it("reports unknown and non-canonical document symbol types without mutating the document", () => {
    const environment = createIndustrialSymbolEnvironment();
    const document = {
      nodes: [
        { id: "canonical", symbolType: "process.centrifugal-pump" },
        { id: "alias", symbolType: "pump.centrifugal" },
        { id: "unknown", symbolType: "vendor.missing" }
      ]
    } as unknown as ScadaDocument;
    const before = structuredClone(document);

    expect(validateDocumentSymbolEnvironment(document, environment)).toEqual({
      valid: false,
      diagnostics: [
        {
          code: "non-canonical-symbol",
          nodeId: "alias",
          symbolType: "pump.centrifugal",
          canonicalType: "process.centrifugal-pump"
        },
        {
          code: "unknown-symbol",
          nodeId: "unknown",
          symbolType: "vendor.missing"
        }
      ]
    });
    expect(document).toEqual(before);
  });
});
