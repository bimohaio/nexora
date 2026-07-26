import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@web-scada/core": new URL("./packages/core/src/index.ts", import.meta.url).pathname,
      "@web-scada/geometry": new URL("./packages/geometry/src/index.ts", import.meta.url).pathname,
      "@web-scada/designer-engine": new URL(
        "./packages/designer-engine/src/index.ts",
        import.meta.url
      ).pathname,
      "@web-scada/renderer-svg": new URL("./packages/renderer-svg/src/index.ts", import.meta.url)
        .pathname,
      "@web-scada/symbols": new URL("./packages/symbols/src/index.ts", import.meta.url).pathname
    }
  },
  test: {
    include: ["packages/**/*.test.ts", "tests/**/*.test.ts"],
    coverage: { reporter: ["text", "html"] }
  }
});
