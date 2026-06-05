import { defineConfig } from "vitest/config"
import { resolve } from "path"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["__tests__/setup.ts"],

    coverage: {
      provider: "v8",
      include: [
        "lib/actions/**",
        "lib/rate-limit.ts",
        "lib/redis.ts",
        "components/**",
        "app/dashboard/**",
        "app/api/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
})