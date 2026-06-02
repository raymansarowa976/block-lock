import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  // Extension tests share one persistent browser context and must run serially
  workers: 1,
  timeout: 30_000,
  use: {
    actionTimeout: 10_000,
  },
})