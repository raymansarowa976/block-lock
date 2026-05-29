import { defineConfig } from "vitest/config"
import { resolve } from "path"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    setupFiles: ["__tests__/setup.ts"],
    environmentMatchGlobs: [
      ["__tests__/actions/**", "node"],
      ["__tests__/components/**", "jsdom"],
      ["__tests__/pages/**", "jsdom"],
    ],
    coverage: {
      provider: "v8",
      include: ["lib/actions/**", "components/**", "app/dashboard/**"],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
})
