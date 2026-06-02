import { createRequire } from "node:module"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const AdmZip = require("adm-zip")

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const DIST = path.join(__dirname, "../dist")
const manifest = JSON.parse(fs.readFileSync(path.join(DIST, "manifest.json"), "utf-8"))
const OUTPUT = path.join(DIST, `block-lock-extension-${manifest.version}.zip`)

const zip = new AdmZip()

function addDir(dir, zipPath) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    const rel = path.join(zipPath, entry.name)
    if (entry.isDirectory()) {
      addDir(full, rel)
    } else if (!entry.name.endsWith(".map") && !entry.name.endsWith(".zip")) {
      zip.addFile(rel.replace(/\\/g, "/"), fs.readFileSync(full))
    }
  }
}

addDir(DIST, "")
zip.writeZip(OUTPUT)
console.log(`Created ${path.relative(process.cwd(), OUTPUT)}`)
