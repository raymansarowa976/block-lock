// @vitest-environment node
import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { DEV_OUT_DIR, STORE_OUT_DIR, outDirForMode } from "../scripts/build-paths.mjs"

const EXTENSION_ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..")

// The store build only trusts https://blocklock.app, so it can't sync with a
// local dashboard. It gets its own folder so `pnpm build` (or a release) never
// overwrites the dev build that's loaded unpacked in Chrome.
describe("outDirForMode", () => {
  it("sends production builds to the store folder", () => {
    expect(outDirForMode("production")).toBe(STORE_OUT_DIR)
  })

  it("sends development builds to the dev folder", () => {
    expect(outDirForMode("development")).toBe(DEV_OUT_DIR)
  })

  it("sends any other mode to the dev folder, never the store folder", () => {
    expect(outDirForMode("staging")).toBe(DEV_OUT_DIR)
  })
})

describe("build output folders", () => {
  it("are different folders", () => {
    expect(STORE_OUT_DIR).not.toBe(DEV_OUT_DIR)
  })

  it("are absolute paths inside the extension package", () => {
    for (const dir of [STORE_OUT_DIR, DEV_OUT_DIR]) {
      expect(path.isAbsolute(dir)).toBe(true)
      expect(path.dirname(dir)).toBe(EXTENSION_ROOT)
    }
  })

  it("keeps the dev build at dist/, where the README says to load it", () => {
    expect(path.basename(DEV_OUT_DIR)).toBe("dist")
  })
})

// Playwright compiles test files to CommonJS, which breaks on .mjs imports
// in CI ("exports is not defined in ES module scope"). So the E2E setup
// spells out the store folder itself, and this keeps the two in step.
describe("E2E setup", () => {
  const fixtures = fs.readFileSync(path.join(EXTENSION_ROOT, "e2e/fixtures.ts"), "utf-8")

  it("does not import any .mjs module", () => {
    expect(fixtures).not.toMatch(/from\s+["'][^"']+\.mjs["']/)
  })

  it("loads the store build folder", () => {
    expect(fixtures).toContain(`path.join(__dirname, "../${path.basename(STORE_OUT_DIR)}")`)
  })
})
