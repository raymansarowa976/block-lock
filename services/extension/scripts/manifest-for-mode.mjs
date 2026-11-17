// manifest.json is the store manifest and must never trust a local dashboard,
// so the dev origin is only added to development builds (`pnpm dev`).
export const DEV_EXTERNALLY_CONNECTABLE_MATCH = "http://localhost:3000/*"

// The Chrome Web Store's public key for Block Lock, from the developer
// dashboard → Package → "View public key". Paste only the base64 body on one
// line, without the BEGIN/END lines. It is a public key, so it is safe to
// commit. Development builds include it so a local unpacked build gets the
// same extension ID as the store install. The store rejects uploads whose
// manifest has a "key" field, so it never goes into manifest.json or the
// store build. Leave empty to give unpacked builds a path-based ID.
export const STORE_PUBLIC_KEY = ""

export function manifestForMode(manifest, mode, key = STORE_PUBLIC_KEY) {
  if (mode !== "development") return manifest

  const matches = manifest.externally_connectable?.matches ?? []
  return {
    ...manifest,
    ...(key ? { key } : {}),
    externally_connectable: {
      ...manifest.externally_connectable,
      matches: [...matches, DEV_EXTERNALLY_CONNECTABLE_MATCH],
    },
  }
}
