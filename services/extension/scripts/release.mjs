// Usage: pnpm --filter extension release <patch|minor|major>
// Bumps manifest.json + package.json and dates the CHANGELOG's Unreleased
// notes. Committing, tagging and uploading stay manual — see RELEASING.md.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { bumpVersion, findReleaseProblems, releaseChangelog } from "./release-lib.mjs"

const ROOT = path.join(fileURLToPath(new URL(".", import.meta.url)), "..")
const MANIFEST = path.join(ROOT, "manifest.json")
const PACKAGE = path.join(ROOT, "package.json")
const CHANGELOG = path.join(ROOT, "CHANGELOG.md")

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf-8"))

// Swap only the top-level "version" value so the files keep their formatting.
function setVersion(file, from, to) {
  const text = fs.readFileSync(file, "utf-8")
  const re = new RegExp(`("version"\\s*:\\s*")${from.replace(/\./g, "\\.")}(")`)
  if (!re.test(text)) throw new Error(`Could not find "version": "${from}" in ${path.basename(file)}`)
  return text.replace(re, `$1${to}$2`)
}

try {
  const type = process.argv[2]
  const manifest = readJson(MANIFEST)
  const pkg = readJson(PACKAGE)
  const changelog = fs.readFileSync(CHANGELOG, "utf-8")

  const current = findReleaseProblems({
    manifestVersion: manifest.version,
    packageVersion: pkg.version,
    changelog,
  })
  if (current.length) throw new Error(`Current version is inconsistent:\n  - ${current.join("\n  - ")}`)

  const next = bumpVersion(manifest.version, type)
  // sv-SE formats as YYYY-MM-DD in local time; toISOString() would use UTC.
  const date = new Date().toLocaleDateString("sv-SE")
  // Compute everything before writing so a failure leaves no partial bump.
  const nextChangelog = releaseChangelog(changelog, next, date)
  const nextManifest = setVersion(MANIFEST, manifest.version, next)
  const nextPackage = setVersion(PACKAGE, pkg.version, next)

  fs.writeFileSync(MANIFEST, nextManifest)
  fs.writeFileSync(PACKAGE, nextPackage)
  fs.writeFileSync(CHANGELOG, nextChangelog)

  console.log(`Bumped extension ${manifest.version} → ${next}`)
  console.log(`Next: review the diff, commit "release: extension v${next}", then follow RELEASING.md`)
} catch (err) {
  console.error(`release failed: ${err.message}`)
  process.exit(1)
}
