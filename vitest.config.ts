import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@web-scada/core": new URL("./packages/core/src/index.ts", import.meta.url).pathname,
      "@web-scada/datasource-core": new URL(
        "./packages/datasource-core/src/index.ts",
        import.meta.url
      ).pathname,
      "@web-scada/binding-engine": new URL(
        "./packages/binding-engine/src/index.ts",
        import.meta.url
      ).pathname,
      "@web-scada/geometry": new URL("./packages/geometry/src/index.ts", import.meta.url).pathname,
      "@web-scada/interaction-engine": new URL(
        "./packages/interaction-engine/src/index.ts",
        import.meta.url
      ).pathname,
      "@web-scada/designer-engine": new URL(
        "./packages/designer-engine/src/index.ts",
        import.meta.url
      ).pathname,
      "@web-scada/renderer-svg": new URL("./packages/renderer-svg/src/index.ts", import.meta.url)
        .pathname,
      "@web-scada/runtime-engine": new URL(
        "./packages/runtime-engine/src/index.ts",
        import.meta.url
      ).pathname,
      "@web-scada/symbols": new URL("./packages/symbols/src/index.ts", import.meta.url).pathname
    }
  },
  test: {
    include: ["packages/**/*.test.ts", "tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/interaction-engine/src/**/*.ts"],
      exclude: [
        "packages/interaction-engine/src/**/*.test.ts",
        "packages/interaction-engine/src/**/*.benchmark.test.ts"
      ],
      reporter: ["text", "html", "json-summary"]
    }
  }
});
