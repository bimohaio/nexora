import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/integration",
  testMatch: "**/*.e2e.ts",
  reporter: "list",
  webServer: {
    command: "pnpm --filter @web-scada/runtime-demo dev --host 127.0.0.1 --port 4173",
    port: 4173,
    reuseExistingServer: true
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry"
  }
});
