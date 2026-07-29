import {
  createIndustrialSymbolRegistry,
  createStandardSymbolCategoryRegistry,
  type InMemorySymbolRegistry,
  type SymbolCategoryRegistry
} from "@web-scada/symbols";
import {
  createInitialSvgSymbolRendererRegistry,
  type InMemorySvgSymbolRendererRegistry
} from "./symbol-renderers.js";

export interface DefaultSymbolEnvironment {
  readonly symbolRegistry: InMemorySymbolRegistry;
  readonly categoryRegistry: SymbolCategoryRegistry;
  readonly svgVisualRegistry: InMemorySvgSymbolRendererRegistry;
}

/**
 * Compatibility composition root for applications that want the complete built-in catalog.
 * Applications needing tree-shaking can create registries and register individual packs instead.
 */
export function createDefaultSymbolEnvironment(): DefaultSymbolEnvironment {
  return {
    symbolRegistry: createIndustrialSymbolRegistry(),
    categoryRegistry: createStandardSymbolCategoryRegistry(),
    svgVisualRegistry: createInitialSvgSymbolRendererRegistry()
  };
}
