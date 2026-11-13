import { defineConfig } from "vitest/config"

// Separate config for post-build artifact tests (e.g. build-zip.test.ts),
// which assert against dist-store/ and must run after `pnpm build`. Kept out of
// vitest.config.ts's default suite since dist-store/ won't exist on a clean checkout.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/__tests__/build-zip.test.ts"],
  },
})
