import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/integration",
  reporter: "list",
  use: { trace: "on-first-retry" }
});
