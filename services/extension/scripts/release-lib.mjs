// Pure helpers shared by release.mjs (version bumps) and zip-dist.mjs
// (pre-package checks). Kept free of fs access so they're unit-testable.

const MAX_PART = 65535
const UNRELEASED_RE = /^## \[Unreleased\][^\n]*\n/m

// Chrome accepts 1–4 dot-separated integers, each 0–65535, with no leading
// zeros and no pre-release suffixes.
// https://developer.chrome.com/docs/extensions/reference/manifest/version
export function isValidChromeVersion(version) {
  if (!/^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,3}$/.test(version)) return false
  return version.split(".").every((part) => Number(part) <= MAX_PART)
}

export function bumpVersion(version, type) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Expected a MAJOR.MINOR.PATCH version, got "${version}"`)
  }
  const [major, minor, patch] = version.split(".").map(Number)
  switch (type) {
    case "major":
      return `${major + 1}.0.0`
    case "minor":
      return `${major}.${minor + 1}.0`
    case "patch":
      return `${major}.${minor}.${patch + 1}`
    default:
      throw new Error(`Bump type must be patch, minor or major, got "${type}"`)
  }
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function changelogHasVersion(changelog, version) {
  return new RegExp(`^## \\[${escapeRegExp(version)}\\]`, "m").test(changelog)
}

// Moves the notes under "## [Unreleased]" into a new "## [version] - date"
// section directly below it, leaving an empty Unreleased section behind.
export function releaseChangelog(changelog, version, date) {
  const heading = UNRELEASED_RE.exec(changelog)
  if (!heading) throw new Error("CHANGELOG.md has no ## [Unreleased] section")
  if (changelogHasVersion(changelog, version)) {
    throw new Error(`CHANGELOG.md already has an entry for ${version}`)
  }

  const bodyStart = heading.index + heading[0].length
  const nextSection = changelog.slice(bodyStart).search(/^## \[/m)
  const bodyEnd = nextSection === -1 ? changelog.length : bodyStart + nextSection
  const notes = changelog.slice(bodyStart, bodyEnd).trim()
  if (!notes) {
    throw new Error("The ## [Unreleased] section is empty — add notes for this release first")
  }

  const rest = changelog.slice(bodyEnd).trimStart()
  return (
    changelog.slice(0, bodyStart) +
    `\n## [${version}] - ${date}\n\n${notes}\n` +
    (rest ? `\n${rest}` : "")
  )
}

export function findReleaseProblems({ manifestVersion, packageVersion, changelog }) {
  const problems = []
  if (!isValidChromeVersion(manifestVersion)) {
    problems.push(`manifest.json version "${manifestVersion}" is not a valid Chrome extension version`)
  }
  if (manifestVersion !== packageVersion) {
    problems.push(
      `manifest.json version "${manifestVersion}" does not match package.json version "${packageVersion}"`,
    )
  }
  if (!changelogHasVersion(changelog, manifestVersion)) {
    problems.push(`CHANGELOG.md has no ## [${manifestVersion}] entry`)
  }
  return problems
}
