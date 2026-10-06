import type { UsageEntry } from "./analytics-buffer"
import { API_BASE } from "./config"

export const FLUSH_ALARM = "analytics-flush"
const FLUSH_INTERVAL_MINUTES = 5

export function registerFlushAlarm(): void {
  chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: FLUSH_INTERVAL_MINUTES })
}

function clearCredential() {
  return { userId: null, token: null, tokenExpiresAt: null }
}

// /api/analytics verifies the same short-lived signed token as /api/sync
// (see auth-handler.ts's syncRules) rather than a cookie-based session — a
// chrome-extension:// service-worker fetch is cross-site, so no dashboard
// session cookie ever reaches the route and a plain fetch() would 401 every
// time.
export async function flushAnalytics(): Promise<void> {
  const { token, tokenExpiresAt, analyticsBuffer } = await chrome.storage.local.get([
    "token",
    "tokenExpiresAt",
    "analyticsBuffer",
  ])

  if (!token || !analyticsBuffer?.length) return

  // Catch a locally-expired token before spending a round-trip on a
  // guaranteed 401, same as syncRules.
  if (typeof tokenExpiresAt === "number" && Date.now() >= tokenExpiresAt) {
    await chrome.storage.local.set({ ...clearCredential(), authError: "session_expired" })
    return
  }

  try {
    const res = await fetch(`${API_BASE}/analytics?token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: analyticsBuffer as UsageEntry[] }),
    })

    if (res.status === 401 || res.status === 403) {
      await chrome.storage.local.set({ ...clearCredential(), authError: "session_expired" })
      return
    }

    if (res.ok) {
      await chrome.storage.local.set({ analyticsBuffer: [] })
    }
  } catch {
    // Network failure — leave buffer intact for next flush cycle
  }
}
