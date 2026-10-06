// @vitest-environment node
import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  isValidChromeVersion,
  bumpVersion,
  releaseChangelog,
  changelogHasVersion,
  findReleaseProblems,
} from "../scripts/release-lib.mjs"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const EXTENSION_ROOT = path.join(__dirname, "..")
const readJson = (file: string) =>
  JSON.parse(fs.readFileSync(path.join(EXTENSION_ROOT, file), "utf-8"))

describe("isValidChromeVersion", () => {
  it.each(["0.1.0", "1", "1.2", "1.2.3", "1.2.3.4", "65535.0.0"])("accepts %s", (v) => {
    expect(isValidChromeVersion(v)).toBe(true)
  })

  // Chrome rejects pre-release tags, leading zeros, >4 parts and parts >65535.
  it.each(["", "1.2.3.4.5", "1.0.0-beta", "01.2.3", "1.2.65536", "v1.2.3", "1..2"])(
    "rejects %s",
    (v) => {
      expect(isValidChromeVersion(v)).toBe(false)
    },
  )
})

describe("bumpVersion", () => {
  it("bumps patch", () => {
    expect(bumpVersion("0.1.0", "patch")).toBe("0.1.1")
  })

  it("bumps minor and resets patch", () => {
    expect(bumpVersion("0.1.7", "minor")).toBe("0.2.0")
  })

  it("bumps major and resets minor and patch", () => {
    expect(bumpVersion("0.4.2", "major")).toBe("1.0.0")
  })

  it("rejects an unknown bump type", () => {
    expect(() => bumpVersion("0.1.0", "huge")).toThrow(/patch, minor or major/)
  })

  it("rejects a version that is not MAJOR.MINOR.PATCH", () => {
    expect(() => bumpVersion("1.2", "patch")).toThrow(/MAJOR.MINOR.PATCH/)
  })
})

const CHANGELOG = `# Changelog

## [Unreleased]

### Fixed
- Popup no longer flickers on open.

## [0.1.0] - 2026-10-04

### Added
- Initial release.
`

describe("releaseChangelog", () => {
  it("moves Unreleased notes under a dated version heading and leaves Unreleased empty", () => {
    const out = releaseChangelog(CHANGELOG, "0.1.1", "2026-11-01")

    expect(out).toContain("## [Unreleased]\n\n## [0.1.1] - 2026-11-01\n\n### Fixed\n- Popup no longer flickers on open.")
    expect(out).toContain("## [0.1.0] - 2026-10-04")
    expect(out.indexOf("## [0.1.1]")).toBeLessThan(out.indexOf("## [0.1.0]"))
  })

  it("refuses to release when Unreleased has no notes", () => {
    const empty = CHANGELOG.replace(/### Fixed\n- Popup no longer flickers on open.\n\n/, "")
    expect(() => releaseChangelog(empty, "0.1.1", "2026-11-01")).toThrow(/Unreleased.*empty/)
  })

  it("refuses when there is no Unreleased section", () => {
    expect(() => releaseChangelog("# Changelog\n", "0.1.1", "2026-11-01")).toThrow(/Unreleased/)
  })

  it("refuses to release a version that already has an entry", () => {
    expect(() => releaseChangelog(CHANGELOG, "0.1.0", "2026-11-01")).toThrow(/already/)
  })
})

describe("changelogHasVersion", () => {
  it("finds a released version heading", () => {
    expect(changelogHasVersion(CHANGELOG, "0.1.0")).toBe(true)
  })

  it("does not match a different version that shares a prefix", () => {
    expect(changelogHasVersion(CHANGELOG, "0.1")).toBe(false)
  })
})

describe("findReleaseProblems", () => {
  const ok = { manifestVersion: "0.1.0", packageVersion: "0.1.0", changelog: CHANGELOG }

  it("returns nothing for a consistent release", () => {
    expect(findReleaseProblems(ok)).toEqual([])
  })

  it("flags a manifest/package.json version mismatch", () => {
    expect(findReleaseProblems({ ...ok, packageVersion: "0.2.0" }).join()).toMatch(/does not match/)
  })

  it("flags a version Chrome would reject", () => {
    expect(findReleaseProblems({ ...ok, manifestVersion: "0.1.0-beta", packageVersion: "0.1.0-beta" }).join()).toMatch(
      /not a valid Chrome extension version/,
    )
  })

  it("flags a version with no changelog entry", () => {
    expect(findReleaseProblems({ ...ok, manifestVersion: "0.3.0", packageVersion: "0.3.0" }).join()).toMatch(
      /CHANGELOG/,
    )
  })
})

// Runs in CI on every PR so the shipped files can never drift apart.
describe("repository release state", () => {
  it("manifest.json, package.json and CHANGELOG.md agree on the current version", () => {
    const problems = findReleaseProblems({
      manifestVersion: readJson("manifest.json").version,
      packageVersion: readJson("package.json").version,
      changelog: fs.readFileSync(path.join(EXTENSION_ROOT, "CHANGELOG.md"), "utf-8"),
    })
    expect(problems).toEqual([])
  })

  it("exposes a release script", () => {
    expect(readJson("package.json").scripts.release).toBe("node scripts/release.mjs")
  })
})
