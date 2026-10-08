import { DomainSchema } from "@block-lock/shared-types"

// Strips URL parts the user may have pasted, then defers to the shared
// DomainSchema so the extension canonicalises domains exactly as the server does.
export function sanitiseDomain(raw: string): string | null {
  let d = raw.trim()
  d = d.replace(/^https?:\/\//i, "")
  d = d.split("/")[0].split("?")[0].split("#")[0]
  d = d.split(":")[0]
  d = d.replace(/^\.+|\.+$/g, "")
  const result = DomainSchema.safeParse(d)
  return result.success ? result.data : null
}
