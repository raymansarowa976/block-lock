import path from "node:path"
import { fileURLToPath } from "node:url"

const EXTENSION_ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..")

// `pnpm dev` builds here. This is the folder you load unpacked in Chrome, and
// only this build trusts the local dashboard on http://localhost:3000.
export const DEV_OUT_DIR = path.join(EXTENSION_ROOT, "dist")

// `pnpm build` builds the Chrome Web Store version and its zip here. That
// build only talks to https://blocklock.app, so it can't sync with a local
// dashboard. A separate folder stops it from overwriting the dev build.
export const STORE_OUT_DIR = path.join(EXTENSION_ROOT, "dist-store")

export function outDirForMode(mode) {
  return mode === "production" ? STORE_OUT_DIR : DEV_OUT_DIR
}
