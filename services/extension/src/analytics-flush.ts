import type { UsageEntry } from "./analytics-buffer"
import { API_BASE } from "./config"
import { expireSession, getAccessToken } from "./sync-credential"

export const FLUSH_ALARM = "analytics-flush"
const FLUSH_INTERVAL_MINUTES = 5

export function registerFlushAlarm(): void {
  chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: FLUSH_INTERVAL_MINUTES })
}

// /api/analytics verifies the same short-lived signed token as /api/sync
// (see auth-handler.ts's syncRules) rather than a cookie-based session — a
// chrome-extension:// service-worker fetch is cross-site, so no dashboard
// session cookie ever reaches the route and a plain fetch() would 401 every
// time.
export async function flushAnalytics(): Promise<void> {
  const { analyticsBuffer } = await chrome.storage.local.get(["analyticsBuffer"])
  if (!analyticsBuffer?.length) return

  // Renews an expired access token with the refresh token, same as
  // syncRules. On a transient failure the buffer waits for the next flush.
  const access = await getAccessToken()
  if (access.status !== "ok") return
  const { token } = access

  try {
    const res = await fetch(`${API_BASE}/analytics`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ entries: analyticsBuffer as UsageEntry[] }),
    })

    if (res.status === 401 || res.status === 403) {
      await expireSession()
      return
    }

    if (res.ok) {
      await chrome.storage.local.set({ analyticsBuffer: [] })
    }
  } catch {
    // Network failure — leave buffer intact for next flush cycle
  }
}
