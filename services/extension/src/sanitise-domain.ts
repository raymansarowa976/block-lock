const VALID_DOMAIN = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/

export function sanitiseDomain(raw: string): string | null {
  let d = raw.trim()
  d = d.replace(/^https?:\/\//i, "")
  d = d.split("/")[0].split("?")[0].split("#")[0]
  d = d.split(":")[0]
  d = d.replace(/^\.+|\.+$/g, "")
  return VALID_DOMAIN.test(d) ? d : null
}