// manifest.json is the store manifest and must never trust a local dashboard,
// so the dev origin is only added to development builds (`pnpm dev`).
export const DEV_EXTERNALLY_CONNECTABLE_MATCH = "http://localhost:3000/*"

export function manifestForMode(manifest, mode) {
  if (mode !== "development") return manifest

  const matches = manifest.externally_connectable?.matches ?? []
  return {
    ...manifest,
    externally_connectable: {
      ...manifest.externally_connectable,
      matches: [...matches, DEV_EXTERNALLY_CONNECTABLE_MATCH],
    },
  }
}
