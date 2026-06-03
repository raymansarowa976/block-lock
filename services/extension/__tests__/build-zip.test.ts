// @vitest-environment node
import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import AdmZip from "adm-zip"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const DIST = path.join(__dirname, "../dist")
const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../manifest.json"), "utf-8"),
)
const EXPECTED_ZIP = path.join(DIST, `block-lock-extension-${manifest.version}.zip`)

const REQUIRED_ENTRIES = ["manifest.json", "popup.html", "src/background.js"]

describe("extension production zip archive", () => {
  it("dist/ contains a versioned zip matching the manifest version", () => {
    expect(fs.existsSync(EXPECTED_ZIP)).toBe(true)
  })

  it("zip contains all required production assets", () => {
    const zip = new AdmZip(EXPECTED_ZIP)
    const entries = zip.getEntries().map((e: AdmZip.IZipEntry) => e.entryName)

    for (const required of REQUIRED_ENTRIES) {
      expect(entries.some((e) => e.includes(required))).toBe(true)
    }
  })

  it("zip does not include node_modules or source map files", () => {
    const zip = new AdmZip(EXPECTED_ZIP)
    const entries = zip.getEntries().map((e: AdmZip.IZipEntry) => e.entryName)

    expect(entries.some((e) => e.includes("node_modules"))).toBe(false)
    expect(entries.some((e) => e.endsWith(".map"))).toBe(false)
  })
})