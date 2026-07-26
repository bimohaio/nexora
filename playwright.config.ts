import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/integration",
  testMatch: "**/*.e2e.ts",
  reporter: "list",
  webServer: [
    {
      command: "pnpm --filter @web-scada/runtime-demo dev --host 127.0.0.1 --port 4173",
      port: 4173,
      reuseExistingServer: true
    },
    {
      command: "pnpm --filter @web-scada/symbol-gallery dev --host 127.0.0.1 --port 4174",
      port: 4174,
      reuseExistingServer: true
    },
    {
      command: "pnpm --filter @web-scada/designer-demo dev --host 127.0.0.1 --port 4175",
      port: 4175,
      reuseExistingServer: true
    }
  ],
  projects: [
    {
      name: "runtime-demo",
      testMatch: "**/runtime-demo.e2e.ts",
      use: { baseURL: "http://127.0.0.1:4173", trace: "on-first-retry" }
    },
    {
      name: "symbol-gallery",
      testMatch: "**/symbol-gallery.e2e.ts",
      use: { baseURL: "http://127.0.0.1:4174", trace: "on-first-retry" }
    },
    {
      name: "designer-demo",
      testMatch: "**/designer-demo.e2e.ts",
      use: { baseURL: "http://127.0.0.1:4175", trace: "on-first-retry" }
    }
  ]
});
