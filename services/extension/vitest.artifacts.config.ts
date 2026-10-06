import { defineConfig } from "vitest/config"

// Separate config for post-build artifact tests (e.g. build-zip.test.ts),
// which assert against dist/ and must run after `vite build`. Kept out of
// vitest.config.ts's default suite since dist/ won't exist on a clean checkout.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/__tests__/build-zip.test.ts"],
  },
})
